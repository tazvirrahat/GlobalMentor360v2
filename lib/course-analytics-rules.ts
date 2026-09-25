/**
 * Pure helpers for course analytics. Calendar buckets are in the site's time
 * zone: ISO weeks (starting Monday) and months, as the same YYYY-MM-DD /
 * YYYY-MM strings the SQL produces, so counts can be zero-filled by key.
 */

function calendarDay(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Mondays of the last `count` weeks, oldest first, ending with this week's. */
export function weekStarts(now: Date, count: number, timeZone: string): string[] {
  const today = calendarDay(now, timeZone);
  const sinceMonday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const thisWeek = addDays(today, -sinceMonday);
  return Array.from({ length: count }, (_, i) => addDays(thisWeek, -7 * (count - 1 - i)));
}

/** The first days of the last `count` months as YYYY-MM, oldest first, ending with this month. */
export function monthStarts(now: Date, count: number, timeZone: string): string[] {
  const [year, month] = calendarDay(now, timeZone).split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return date.toISOString().slice(0, 7);
  });
}

/** "2026-09-07" → "7 Sep". */
export function weekLabel(start: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${start}T00:00:00Z`),
  );
}

/** "2026-09" → "Sep 2026". */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

/** Whole percent, floored like progress elsewhere; 0 when there is nobody to count. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.floor((part / whole) * 100) : 0;
}

/**
 * The largest fall in "finished by" between one item and the next, for the
 * sentence under the table. Null when nothing falls (or there is one item).
 */
export function biggestDrop(
  items: { title: string; completed: number }[],
  learners: number,
): { after: string; before: string; points: number } | null {
  let best: { after: string; before: string; points: number } | null = null;
  for (let i = 1; i < items.length; i++) {
    const points = percentOf(items[i - 1]!.completed, learners) - percentOf(items[i]!.completed, learners);
    if (points > 0 && (!best || points > best.points)) {
      best = { after: items[i - 1]!.title, before: items[i]!.title, points };
    }
  }
  return best;
}
