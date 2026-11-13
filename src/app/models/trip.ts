/**
 * A downrange trip: where you'll be and when, so the app can line up the
 * closest workouts for each day you're there.
 */
export interface Trip {
  id: string;
  /** Short label the user sees ("Charlotte", "Thanksgiving at Mom's") */
  name: string;
  /** The full address / place the geocoder matched */
  placeName: string;
  lat: number;
  long: number;
  /** Inclusive YYYY-MM-DD range in the device's local time */
  startDate: string;
  endDate: string;
  /** How far from the address to look for workouts */
  radiusMiles: number;
  createdAt: number;
}

/** The trip fields the reminder backend needs (no local bookkeeping) */
export type TripForReminders = Pick<
    Trip, 'id'|'name'|'lat'|'long'|'startDate'|'endDate'|'radiusMiles'>;

export const TRIP_RADIUS_OPTIONS = [10, 20, 30, 50, 100];
export const DEFAULT_TRIP_RADIUS = 20;
/** The longest a single trip can run; keeps the per-day lists bounded */
export const MAX_TRIP_DAYS = 60;
export const MAX_TRIPS = 20;
