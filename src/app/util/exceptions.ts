/**
 * Per-date instance exceptions from the F3 calendar: an occurrence the region
 * closed, or moved to another time. Near me renders each series' weekly
 * pattern, and only corrects the first week of it — the same 7 days the
 * schedule loads up front — so both pages share this window.
 */
import type {Beatdown, InstanceException} from '../pages/nearby/nearby.page';

export const EXCEPTION_WINDOW_DAYS = 7;

/** The first day offset the schedule shows: past noon, today's workouts are over */
export function firstScheduleDay(now: Date): number {
  return now.getHours() >= 12 ? 1 : 0;
}

/** Whether a day this many days from today gets its exceptions applied */
export function inExceptionWindow(daysFromToday: number, now: Date): boolean {
  const first = firstScheduleDay(now);
  return daysFromToday >= first && daysFromToday < first + EXCEPTION_WINDOW_DAYS;
}

/** A beatdown's exceptions within the window, soonest first */
export function upcomingExceptions(bd: Beatdown, now: Date):
    Array<{dateISO: string; exception: InstanceException}> {
  if (!bd.exceptions) return [];
  const first = firstScheduleDay(now);
  const upcoming = [];
  for (let i = first; i < first + EXCEPTION_WINDOW_DAYS; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const dateISO = toLocalISO(date);
    const exception = bd.exceptions[dateISO];
    if (exception) upcoming.push({dateISO, exception});
  }
  return upcoming;
}

/**
 * Minutes past midnight a "5:30 am - 6:15 am" time string starts at, so
 * times order by the clock ("10:00 am" sorts after "5:30 am"). Unparseable
 * times sort last.
 */
export function startMinutes(timeString: string): number {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(timeString ?? '');
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hours = Number(match[1]) % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  return hours * 60 + Number(match[2]);
}

/** Format a date as local YYYY-MM-DD (toISOString would shift to UTC) */
function toLocalISO(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
