import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActionSheetController, AlertController, ModalController, ToastController} from '@ionic/angular';
import {Subscription} from 'rxjs';
import {Trip} from 'src/app/models/trip';
import {BeatdownService} from 'src/app/services/beatdown.service';
import {PushService, REMINDER_HOUR} from 'src/app/services/push.service';
import {TripsService} from 'src/app/services/trips.service';
import {CityOption, extractCities} from 'src/app/util/cities';
import {dateRangeLabel, dayOfWeek, daysFromToday, eachDay, relativeDayLabel} from 'src/app/util/dates';
import {startMinutes} from 'src/app/util/exceptions';
import {openDirections} from 'src/app/util/external-links';
import {milesBetween} from 'src/app/util/geo';

import {Beatdown, InstanceException} from '../nearby/nearby.page';

import {TripEditorComponent} from './trip-editor/trip-editor.component';

/** A workout as seen from a trip's address */
export interface TripBeatdown {
  bd: Beatdown;
  miles: number;
  exception?: InstanceException;
  /** the time to show: the one-off change on this date, else the usual */
  timeString: string;
}

export interface TripDay {
  dateISO: string;
  label: string;        // Today, Tomorrow, Mon, Nov 17
  weekday: string;      // Monday
  beatdowns: TripBeatdown[];
  expanded: boolean;    // show every workout, not just the closest few
}

export interface TripView {
  trip: Trip;
  accent: string;       // this trip's color, so several cards tell apart at a glance
  initial: string;
  rangeLabel: string;
  radiusLabel: string;
  days: TripDay[];
  workoutCount: number;
  past: boolean;
}

/** How many workouts a day shows before "show more" */
const PREVIEW_COUNT = 3;

/**
 * One color per trip, picked from the id so it never changes once the card
 * exists. Distinct enough that two trips on screen read as different.
 */
const ACCENTS = [
  '#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d',
];

@Component({
  selector: 'app-trips',
  templateUrl: 'trips.page.html',
  styleUrls: ['trips.page.scss'],
})
export class TripsPage implements OnInit, OnDestroy {
  allBDs: Beatdown[]|null = null;
  trips: Trip[] = [];
  views: TripView[] = [];
  pastViews: TripView[] = [];
  showPast = false;
  cities: CityOption[] = [];
  loadError = false;

  readonly pushState$ = this.push.state$;
  readonly pushError$ = this.push.error$;
  readonly reminderHour = `${REMINDER_HOUR % 12 || 12}${REMINDER_HOUR >= 12 ? 'pm' : 'am'}`;
  sendingTest = false;

  private subs = new Subscription();

  constructor(
      private readonly beatdownService: BeatdownService,
      private readonly tripsService: TripsService,
      private readonly push: PushService,
      private readonly modalCtrl: ModalController,
      private readonly actionSheetCtrl: ActionSheetController,
      private readonly alertCtrl: AlertController,
      private readonly toastCtrl: ToastController,
  ) {}

  ngOnInit() {
    this.subs.add(this.tripsService.trips$.subscribe(trips => {
      this.trips = trips;
      this.rebuild();
    }));
    this.beatdownService.getNearbyBeatdowns().subscribe({
      next: (beatdowns) => {
        this.allBDs = beatdowns;
        this.cities = extractCities(beatdowns);
        this.rebuild();
      },
      error: (error) => {
        console.error('Error loading beatdowns:', error);
        this.allBDs = [];
        this.loadError = true;
        this.rebuild();
      },
    });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  /** The date may have rolled over since the tab was last shown */
  ionViewWillEnter() {
    this.rebuild();
  }

  get hasTrips(): boolean {
    return this.trips.length > 0;
  }

  /** Open the editor for a new trip */
  async addTrip() {
    await this.openEditor();
  }

  async editTrip(trip: Trip) {
    await this.openEditor(trip);
  }

  /** Edit / delete choices for a trip card */
  async tripMenu(view: TripView) {
    const sheet = await this.actionSheetCtrl.create({
      header: view.trip.name,
      buttons: [
        {text: 'Edit trip', icon: 'create-outline', role: 'edit'},
        {text: 'Delete trip', icon: 'trash-outline', role: 'destructive'},
        {text: 'Cancel', icon: 'close-outline', role: 'cancel'},
      ],
    });
    await sheet.present();
    const {role} = await sheet.onDidDismiss();
    if (role === 'edit') {await this.editTrip(view.trip);}
    if (role === 'destructive') {await this.confirmDelete(view.trip);}
  }

  async confirmDelete(trip: Trip) {
    const alert = await this.alertCtrl.create({
      header: 'Delete this trip?',
      message: `${trip.name} will be removed from your plans.`,
      buttons: [
        {text: 'Cancel', role: 'cancel'},
        {text: 'Delete', role: 'destructive', handler: () => this.tripsService.remove(trip.id)},
      ],
    });
    await alert.present();
  }

  toggleDay(day: TripDay) {
    day.expanded = !day.expanded;
  }

  visibleBeatdowns(day: TripDay): TripBeatdown[] {
    return day.expanded ? day.beatdowns : day.beatdowns.slice(0, PREVIEW_COUNT);
  }

  hiddenCount(day: TripDay): number {
    return Math.max(0, day.beatdowns.length - PREVIEW_COUNT);
  }

  /** The address link: the phone's map app rather than a browser sheet. */
  openDirections(event: Event, bd: Beatdown) {
    event.preventDefault();
    event.stopPropagation();
    openDirections(bd.lat, bd.long);
  }

  /** The reminders toggle */
  async toggleReminders(event: Event) {
    const wantOn = !!(event as CustomEvent).detail?.checked;
    if (wantOn && this.push.state$.value !== 'on') {
      await this.push.enable();
    } else if (!wantOn && this.push.state$.value === 'on') {
      await this.push.disable();
    }
  }

  async sendTest() {
    if (this.sendingTest) {return;}
    this.sendingTest = true;
    try {
      const message = await this.push.sendTest();
      await this.toast(message);
    } catch (error) {
      console.error('Test reminder failed:', error);
      await this.toast((error as Error)?.message || 'Could not send a test reminder');
    } finally {
      this.sendingTest = false;
    }
  }

  /** "5:30 am" from "5:30 am - 6:15 am"; the column is too narrow for the range */
  startTime(timeString: string): string {
    return (timeString ?? '').split(/\s*-\s*/)[0];
  }

  trackByTrip(_index: number, view: TripView): string {
    return view.trip.id;
  }

  trackByDay(_index: number, day: TripDay): string {
    return day.dateISO;
  }

  private async openEditor(trip?: Trip) {
    const modal = await this.modalCtrl.create({
      component: TripEditorComponent,
      componentProps: {trip, cities: this.cities},
    });
    await modal.present();
    const {data, role} = await modal.onDidDismiss<Trip>();
    if (role === 'save' && data) {
      try {
        this.tripsService.save(data);
        await this.toast(trip ? 'Trip updated' : 'Trip saved');
      } catch (error) {
        await this.toast((error as Error).message);
      }
    }
  }

  /** Recompute every trip's per-day workout lists */
  private rebuild() {
    const now = new Date();
    const expanded = new Map<string, boolean>();
    for (const view of [...this.views, ...this.pastViews]) {
      for (const day of view.days) {
        if (day.expanded) {expanded.set(`${view.trip.id}|${day.dateISO}`, true);}
      }
    }

    const accents = assignAccents(this.trips);
    const views = this.trips.map(trip => this.buildView(trip, now, expanded, accents.get(trip.id)));
    this.views = views.filter(v => !v.past);
    this.pastViews = views.filter(v => v.past).reverse();
  }

  private buildView(trip: Trip, now: Date, expanded: Map<string, boolean>, accent: string): TripView {
    // like the nearby list: past noon, today's workouts are over
    const firstOffset = now.getHours() >= 12 ? 1 : 0;
    const days: TripDay[] = eachDay(trip.startDate, trip.endDate)
        .filter(dateISO => daysFromToday(dateISO, now) >= firstOffset)
        .map(dateISO => {
          const weekday = dayOfWeek(dateISO);
          return {
            dateISO,
            label: relativeDayLabel(dateISO, now),
            weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
            beatdowns: this.workoutsFor(trip, dateISO, weekday),
            expanded: expanded.get(`${trip.id}|${dateISO}`) ?? false,
          };
        });

    return {
      trip,
      accent,
      initial: (trip.name.trim().charAt(0) || 'T').toUpperCase(),
      rangeLabel: dateRangeLabel(trip.startDate, trip.endDate, now),
      radiusLabel: `${trip.radiusMiles} mi`,
      days,
      workoutCount: days.reduce((sum, d) => sum + d.beatdowns.length, 0),
      past: days.length === 0 && daysFromToday(trip.endDate, now) < firstOffset,
    };
  }

  /** Workouts on that weekday within the trip's radius, closest first */
  private workoutsFor(trip: Trip, dateISO: string, weekday: string): TripBeatdown[] {
    if (!this.allBDs) {return [];}
    return this.allBDs
        .filter(bd => bd.dayOfWeek === weekday)
        .map(bd => {
          const exception = bd.exceptions?.[dateISO];
          return {
            bd,
            miles: milesBetween(bd.lat, bd.long, trip.lat, trip.long),
            exception,
            timeString: exception?.status === 'different-time' && exception.timeString ?
                exception.timeString : bd.timeString,
          };
        })
        .filter(tb => tb.miles <= trip.radiusMiles)
        .sort((a, b) => a.miles - b.miles ||
                  startMinutes(a.timeString) - startMinutes(b.timeString));
  }

  private async toast(message: string) {
    const toast = await this.toastCtrl.create({message, duration: 2500, position: 'bottom'});
    await toast.present();
  }
}


/**
 * Each trip gets the color its id hashes to, and when two trips land on the
 * same one the newer trip takes the next free color. Colors therefore stay
 * put as trips are added and edited, and no two of the first eight collide.
 */
const assignAccents = (trips: Trip[]): Map<string, string> => {
  const byAge = [...trips].sort((a, b) => a.createdAt - b.createdAt);
  const taken = new Set<number>();
  const accents = new Map<string, string>();
  for (const trip of byAge) {
    let index = hash(trip.id) % ACCENTS.length;
    if (taken.size < ACCENTS.length) {
      while (taken.has(index)) {
        index = (index + 1) % ACCENTS.length;
      }
    }
    taken.add(index);
    accents.set(trip.id, ACCENTS[index]);
  }
  return accents;
};

/** FNV-1a: short ids still spread evenly across the palette */
const hash = (value: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};
