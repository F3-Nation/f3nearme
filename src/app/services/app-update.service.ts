import {Injectable, NgZone} from '@angular/core';
import {SwUpdate, VersionReadyEvent} from '@angular/service-worker';
import {BehaviorSubject} from 'rxjs';
import {filter} from 'rxjs/operators';

/** Delay before the first explicit update check, so startup stays snappy. */
const FIRST_CHECK_MS = 10 * 1000;
/** How often to poll for a new deployment while the app stays open. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Watches the Angular service worker for newly deployed versions and exposes
 * whether one is ready so the app can offer a one-tap reload. Without this an
 * installed PWA only picks up new code on the second launch after a deploy.
 */
@Injectable({providedIn: 'root'})
export class AppUpdateService {
  /** True once a new version has been downloaded and is waiting to activate. */
  readonly updateReady$ = new BehaviorSubject(false);

  private started = false;

  constructor(
      private readonly updates: SwUpdate,
      private readonly zone: NgZone,
  ) {}

  start(): void {
    if (this.started || !this.updates.isEnabled) {
      return;
    }
    this.started = true;

    this.updates.versionUpdates
        .pipe(filter(
            (e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => this.zone.run(() => this.updateReady$.next(true)));

    // A broken/partial cache state is rare but unrecoverable without a reload.
    this.updates.unrecoverable.subscribe(() => document.location.reload());

    // Poll shortly after launch, then periodically, and whenever the user
    // switches back to the app (the common path for a home-screen PWA). The
    // timers run outside Angular so they never trigger change detection.
    this.zone.runOutsideAngular(() => {
      setTimeout(() => {
        this.check();
        setInterval(() => this.check(), CHECK_INTERVAL_MS);
      }, FIRST_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.check();
        }
      });
    });
  }

  /** Activates the already-downloaded version by reloading the page. */
  reload(): void {
    document.location.reload();
  }

  /** Hides the offer for this session; the new version loads next launch. */
  dismiss(): void {
    this.updateReady$.next(false);
  }

  private check(): void {
    this.updates.checkForUpdate().catch(() => {
      // Offline or the server is unreachable; the next check will retry.
    });
  }
}
