/**
 * Per-date instance exceptions from the F3 calendar: an occurrence the region
 * closed, or moved to another time. The sync only fetches the next 30 days of
 * them, so days the schedule shows past that render as the usual pattern.
 */
import type {Beatdown, InstanceException} from '../pages/nearby/nearby.page';

/** A beatdown's exceptions that haven't passed yet, soonest first */
export function upcomingExceptions(bd: Beatdown, now: Date):
    Array<{dateISO: string; exception: InstanceException}> {
  // past noon, today's workouts are over (the schedule drops today too)
  const first = new Date(now);
  if (now.getHours() >= 12) first.setDate(first.getDate() + 1);
  const firstISO = toLocalISO(first);
  return Object.entries(bd.exceptions ?? {})
      .filter(([dateISO]) => dateISO >= firstISO)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateISO, exception]) => ({dateISO, exception}));
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
