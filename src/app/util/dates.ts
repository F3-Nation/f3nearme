/**
 * Local-date helpers. Dates in the app are "YYYY-MM-DD" strings in the
 * device's local time; using toISOString would shift them to UTC and put
 * evening plans on the wrong day.
 */

export const DAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
];

/** Format a date as local YYYY-MM-DD */
export function toLocalISO(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parse a YYYY-MM-DD string as local midnight */
export function parseLocalISO(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** A new date "days" days later */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Today as YYYY-MM-DD */
export function todayISO(now = new Date()): string {
  return toLocalISO(now);
}

/** Lowercase weekday name ("monday") for a YYYY-MM-DD date */
export function dayOfWeek(iso: string): string {
  return DAY_NAMES[parseLocalISO(iso).getDay()];
}

/** Whole days from today to the given date (negative when it has passed) */
export function daysFromToday(iso: string, now = new Date()): number {
  const today = parseLocalISO(toLocalISO(now));
  return Math.round((parseLocalISO(iso).getTime() - today.getTime()) / 86400000);
}

/** "Today", "Tomorrow", else "Mon, Nov 17" */
export function relativeDayLabel(iso: string, now = new Date()): string {
  const offset = daysFromToday(iso, now);
  if (offset === 0) {return 'Today';}
  if (offset === 1) {return 'Tomorrow';}
  return parseLocalISO(iso).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'});
}

/** "Nov 17" or "Nov 17, 2027" when it isn't this year */
export function shortDate(iso: string, now = new Date()): string {
  const date = parseLocalISO(iso);
  const opts: Intl.DateTimeFormatOptions = {month: 'short', day: 'numeric'};
  if (date.getFullYear() !== now.getFullYear()) {opts.year = 'numeric';}
  return date.toLocaleDateString(undefined, opts);
}

/** "Nov 17 – 20" / "Nov 28 – Dec 2" / "Nov 17" for a single day */
export function dateRangeLabel(startISO: string, endISO: string, now = new Date()): string {
  if (startISO === endISO) {return shortDate(startISO, now);}
  const start = parseLocalISO(startISO);
  const end = parseLocalISO(endISO);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${shortDate(startISO, now).replace(/,.*$/, '')} – ${end.getDate()}${
        end.getFullYear() !== now.getFullYear() ? `, ${end.getFullYear()}` : ''}`;
  }
  return `${shortDate(startISO, now)} – ${shortDate(endISO, now)}`;
}

/** Every YYYY-MM-DD from start through end, inclusive (capped for safety) */
export function eachDay(startISO: string, endISO: string, maxDays = 60): string[] {
  const days: string[] = [];
  let cursor = parseLocalISO(startISO);
  const end = parseLocalISO(endISO);
  while (cursor.getTime() <= end.getTime() && days.length < maxDays) {
    days.push(toLocalISO(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}
