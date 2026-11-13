import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {map} from 'rxjs/operators';

import {MAX_TRIP_DAYS, MAX_TRIPS, Trip} from '../models/trip';
import {eachDay} from '../util/dates';

/**
 * Where saved trips live. Versioned so a future shape change can migrate
 * instead of silently dropping a user's plans.
 *
 * localStorage is the right store here: it survives service-worker updates
 * (new app versions keep the same origin), and an installed PWA is exempt
 * from the script-writable storage eviction that applies to plain Safari
 * tabs. Reads are defensive so a corrupted or hand-edited value can never
 * crash the app.
 */
const STORAGE_KEY = 'f3nearme.trips';
const STORAGE_VERSION = 1;

interface StoredTrips {
  version: number;
  trips: Trip[];
}

@Injectable({providedIn: 'root'})
export class TripsService {
  private readonly tripsSubject = new BehaviorSubject<Trip[]>(this.load());

  /** All saved trips, soonest first */
  readonly trips$: Observable<Trip[]> = this.tripsSubject.asObservable();

  constructor() {
    // Ask the browser not to evict our storage under pressure. Best effort;
    // most browsers grant it to installed apps automatically.
    try {
      navigator.storage?.persist?.().catch(() => {});
    } catch {
      // not supported
    }

    // Another tab (or the same app in a browser tab) saved a trip: stay in
    // sync rather than clobbering it on our next write.
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.tripsSubject.next(this.load());
      }
    });
  }

  get trips(): Trip[] {
    return this.tripsSubject.value;
  }

  /** Trips that still have at least one day on or after today */
  upcoming$(): Observable<Trip[]> {
    return this.trips$.pipe(map(trips => trips.filter(t => !this.isPast(t))));
  }

  isPast(trip: Trip, todayISO = localToday()): boolean {
    return trip.endDate < todayISO;
  }

  /** Save a new trip or replace one with the same id */
  save(trip: Trip): void {
    const normalized = this.normalize(trip);
    const others = this.trips.filter(t => t.id !== normalized.id);
    if (others.length >= MAX_TRIPS) {
      throw new Error(`You can save up to ${MAX_TRIPS} trips`);
    }
    this.persist([...others, normalized]);
  }

  remove(id: string): void {
    this.persist(this.trips.filter(t => t.id !== id));
  }

  newId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  private normalize(trip: Trip): Trip {
    let {startDate, endDate} = trip;
    if (endDate < startDate) {[startDate, endDate] = [endDate, startDate];}
    // clamp absurd ranges rather than rendering months of days
    const days = eachDay(startDate, endDate, MAX_TRIP_DAYS + 1);
    if (days.length > MAX_TRIP_DAYS) {endDate = days[MAX_TRIP_DAYS - 1];}
    return {
      ...trip,
      name: trip.name.trim() || trip.placeName.split(',')[0].trim() || 'Trip',
      startDate,
      endDate,
    };
  }

  private persist(trips: Trip[]): void {
    const sorted = [...trips].sort(
        (a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt - b.createdAt);
    const stored: StoredTrips = {version: STORAGE_VERSION, trips: sorted};
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (error) {
      console.error('Could not save trips:', error);
    }
    this.tripsSubject.next(sorted);
  }

  private load(): Trip[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {return [];}
      const parsed = JSON.parse(raw) as Partial<StoredTrips>;
      const trips = Array.isArray(parsed?.trips) ? parsed.trips : [];
      return this.migrate(parsed?.version ?? 0, trips)
          .filter(isTrip)
          .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt - b.createdAt);
    } catch (error) {
      console.error('Could not read saved trips:', error);
      return [];
    }
  }

  /** Bring older stored shapes up to the current version */
  private migrate(version: number, trips: unknown[]): unknown[] {
    // version 0/1: the original shape, nothing to do yet
    return version <= STORAGE_VERSION ? trips : trips;
  }
}

function localToday(): string {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isTrip(value: unknown): value is Trip {
  const t = value as Trip;
  return !!t && typeof t === 'object' &&
      typeof t.id === 'string' && typeof t.name === 'string' &&
      typeof t.placeName === 'string' &&
      Number.isFinite(t.lat) && Number.isFinite(t.long) &&
      typeof t.startDate === 'string' && ISO_DATE.test(t.startDate) &&
      typeof t.endDate === 'string' && ISO_DATE.test(t.endDate) &&
      Number.isFinite(t.radiusMiles) && Number.isFinite(t.createdAt);
}
