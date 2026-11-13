import {Injectable, NgZone} from '@angular/core';
import {AngularFireFunctions} from '@angular/fire/compat/functions';
import {SwPush} from '@angular/service-worker';
import {BehaviorSubject} from 'rxjs';
import {debounceTime, skip, take} from 'rxjs/operators';
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

@Injectable({providedIn: 'root'})
export class PushService {
  readonly state$ = new BehaviorSubject<PushState>('off');
  /** The last error shown to the user, if any */
  readonly error$ = new BehaviorSubject<string>('');

  private started = false;

  constructor(
      private readonly swPush: SwPush,
      private readonly fns: AngularFireFunctions,
      private readonly trips: TripsService,
      private readonly zone: NgZone,
  ) {}

  /** Work out the initial state and keep the backend's copy of trips fresh */
  start(): void {
    if (this.started) {return;}
    this.started = true;

    this.state$.next(this.detectState());
    if (this.state$.value !== 'off') {return;}

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
      if (this.state$.value !== 'on') {return;}
      this.swPush.subscription.pipe(take(1)).subscribe(sub => {
        if (sub) {this.sync(sub).catch(() => {});}
      });
    });
  }

  /** Ask for permission and register this device for 8pm reminders */
  async enable(): Promise<void> {
    if (!['off', 'denied'].includes(this.state$.value)) {return;}
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
    if (this.state$.value !== 'on') {return;}
    this.error$.next('');
    this.state$.next('busy');
    try {
      const sub = await this.swPush.subscription.pipe(take(1)).toPromise();
      if (sub) {
        await this.call('deletePushSubscription', {endpoint: sub.endpoint}).catch(() => {});
        await this.swPush.unsubscribe().catch(() => {});
      }
    } finally {
      this.setEnabled(false);
      this.zone.run(() => this.state$.next('off'));
    }
  }

  /** Have the backend send this device a sample reminder right now */
  async sendTest(): Promise<string> {
    const sub = await this.swPush.subscription.pipe(take(1)).toPromise();
    if (!sub) {throw new Error('Reminders are not turned on');}
    const result = await this.call('sendTripReminderTest', {endpoint: sub.endpoint});
    return result?.message ?? 'Sent';
  }

  private async sync(sub: PushSubscription): Promise<void> {
    const trips: TripForReminders[] = this.trips.trips.map(
        ({id, name, lat, long, startDate, endDate, radiusMiles}) =>
            ({id, name, lat, long, startDate, endDate, radiusMiles}));
    await this.call('savePushSubscription', {
      subscription: sub.toJSON(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      trips,
    });
  }

  private call(name: string, data: unknown): Promise<any> {
    return this.fns.httpsCallable(name)(data).toPromise();
  }

  private detectState(): PushState {
    if (!this.swPush.isEnabled || !('Notification' in window)) {return 'unsupported';}
    if (!('PushManager' in window)) {
      return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
    }
    if (Notification.permission === 'denied') {return 'denied';}
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

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
}
