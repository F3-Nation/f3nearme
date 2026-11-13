import {Injectable, NgZone} from '@angular/core';
import {AngularFirestore} from '@angular/fire/compat/firestore';
import {SwPush} from '@angular/service-worker';
import {BehaviorSubject} from 'rxjs';
import {debounceTime, filter, skip, take, timeout} from 'rxjs/operators';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import {environment} from 'src/environments/environment';

import {TripForReminders} from '../models/trip';

import {TripsService} from './trips.service';

/**
 * Where trip reminders stand on this device:
 *  - unsupported: this browser can't do web push (or this is a dev build
 *    without the service worker)
 *  - needs-install: iOS only offers push to apps on the home screen
 *  - denied: the user blocked notifications for the site
 *  - off: available, not turned on
 *  - on: subscribed; the backend has the trips and will remind at 8pm
 *  - busy: a subscribe / unsubscribe is in flight
 */
export type PushState = 'unsupported'|'needs-install'|'denied'|'off'|'on'|'busy';

/** Remembers that the user turned reminders on, so launches re-sync trips */
const ENABLED_KEY = 'f3nearme.tripReminders';
/** Hour of the day (local to the device) the backend sends the reminder */
export const REMINDER_HOUR = 20;
/**
 * The device's own record: subscription, trips and timezone. The doc id is
 * the sha256 of the push endpoint (the Firestore rules enforce it), which
 * keeps the collection un-enumerable without any auth or server round trip.
 */
const COLLECTION = 'pushSubscriptions';
/** How long to wait for the backend to report on a test push */
const TEST_TIMEOUT_MS = 20 * 1000;

interface TestResult {
  requestedAt: number;
  ok: boolean;
  message: string;
}

@Injectable({providedIn: 'root'})
export class PushService {
  readonly state$ = new BehaviorSubject<PushState>('off');
  /** The last error shown to the user, if any */
  readonly error$ = new BehaviorSubject<string>('');

  private started = false;

  constructor(
      private readonly swPush: SwPush,
      private readonly afs: AngularFirestore,
      private readonly trips: TripsService,
      private readonly zone: NgZone,
  ) {}

  /** Work out the initial state and keep the backend's copy of trips fresh */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.state$.next(this.detectState());
    if (this.state$.value !== 'off') {
      return;
    }

    if (this.wasEnabled()) {
      // Confirm the subscription survived (the service worker keeps it
      // across app updates) and push the current trips + timezone, which
      // may have changed since the last launch — e.g. after flying out.
      this.swPush.subscription.pipe(take(1)).subscribe(sub => {
        if (sub) {
          this.state$.next('on');
          this.sync(sub).catch(() => {});
        } else {
          this.setEnabled(false);
        }
      });
    }

    // Trips edited while reminders are on: tell the backend after the
    // burst of edits settles.
    this.trips.trips$.pipe(skip(1), debounceTime(1500)).subscribe(() => {
      if (this.state$.value !== 'on') {
        return;
      }
      this.swPush.subscription.pipe(take(1)).subscribe(sub => {
        if (sub) {
          this.sync(sub).catch(() => {});
        }
      });
    });
  }

  /** Ask for permission and register this device for 8pm reminders */
  async enable(): Promise<void> {
    if (!['off', 'denied'].includes(this.state$.value)) {
      return;
    }
    this.error$.next('');
    this.state$.next('busy');
    try {
      const sub = await this.swPush.requestSubscription({
        serverPublicKey: environment.vapidPublicKey,
      });
      await this.sync(sub);
      this.setEnabled(true);
      this.zone.run(() => this.state$.next('on'));
    } catch (error) {
      console.error('Could not enable trip reminders:', error);
      const denied = Notification.permission === 'denied';
      this.error$.next(denied ?
          'Notifications are blocked for F3 Near Me in your browser settings.' :
          'Could not turn on reminders. Please try again.');
      this.zone.run(() => this.state$.next(denied ? 'denied' : 'off'));
    }
  }

  /** Stop reminders and forget this device on the backend */
  async disable(): Promise<void> {
    if (this.state$.value !== 'on') {
      return;
    }
    this.error$.next('');
    this.state$.next('busy');
    try {
      const sub = await this.swPush.subscription.pipe(take(1)).toPromise();
      if (sub) {
        await this.afs.doc(`${COLLECTION}/${await docId(sub)}`).delete().catch(() => {});
        await this.swPush.unsubscribe().catch(() => {});
      }
    } finally {
      this.setEnabled(false);
      this.zone.run(() => this.state$.next('off'));
    }
  }

  /**
   * Have the backend send this device a sample reminder right now: stamping
   * the doc fires a Firestore trigger, which writes back how it went.
   */
  async sendTest(): Promise<string> {
    const sub = await this.swPush.subscription.pipe(take(1)).toPromise();
    if (!sub) {
      throw new Error('Reminders are not turned on');
    }
    const doc = this.afs.doc<{testRequestedAt?: number; testResult?: TestResult}>(`${COLLECTION}/${await docId(sub)}`);
    const requestedAt = Date.now();
    // the doc may be missing if the backend dropped a dead subscription
    await this.sync(sub);
    await doc.update({testRequestedAt: requestedAt});
    const result = await doc.valueChanges()
        .pipe(
            filter(data => data?.testResult?.requestedAt === requestedAt),
            take(1),
            timeout(TEST_TIMEOUT_MS),
        )
        .toPromise()
        .catch(() => null);
    if (!result?.testResult) {
      throw new Error('No reply from the server yet; give it a minute and check your notifications');
    }
    if (!result.testResult.ok) {
      throw new Error(result.testResult.message);
    }
    return result.testResult.message;
  }

  private async sync(sub: PushSubscription): Promise<void> {
    const trips: TripForReminders[] = this.trips.trips.map(
        ({id, name, lat, long, startDate, endDate, radiusMiles}) =>
            ({id, name, lat, long, startDate, endDate, radiusMiles}));
    const json = sub.toJSON();
    await this.afs.doc(`${COLLECTION}/${await docId(sub)}`).set({
      subscription: {endpoint: json.endpoint, keys: {p256dh: json.keys.p256dh, auth: json.keys.auth}},
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      trips,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  }

  private detectState(): PushState {
    if (!this.swPush.isEnabled || !('Notification' in window)) {
      return 'unsupported';
    }
    if (!('PushManager' in window)) {
      return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
    }
    if (Notification.permission === 'denied') {
      return 'denied';
    }
    return 'off';
  }

  private wasEnabled(): boolean {
    try {
      return localStorage.getItem(ENABLED_KEY) === 'on';
    } catch {
      return false;
    }
  }

  private setEnabled(on: boolean): void {
    try {
      if (on) {
        localStorage.setItem(ENABLED_KEY, 'on');
      } else {
        localStorage.removeItem(ENABLED_KEY);
      }
    } catch {
      // storage unavailable; the subscription itself still lives in the SW
    }
  }
}

/** sha256 hex of the push endpoint, matching the backend and the rules */
const docId = async (sub: PushSubscription): Promise<string> => {
  const bytes = new TextEncoder().encode(sub.endpoint);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const isIOS = (): boolean => {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
};

const isStandalone = (): boolean =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
