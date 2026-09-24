/**
 * Groups a newest-first list under day headings: "Today", "Yesterday", then a
 * date. Days are the site's calendar days (Asia/Dhaka), not the server's, so a
 * notification sent at 02:00 in Dhaka is "Today" there even though it is still
 * yesterday in UTC.
 */

export type DayGroup<T> = {
  /** The calendar day, YYYY-MM-DD in `timeZone`. Stable, so it can be a key or an id. */
  day: string;
  label: string;
  items: T[];
};

function calendarDay(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function previousDay(day: string): string {
  const midnight = new Date(`${day}T00:00:00Z`);
  midnight.setUTCDate(midnight.getUTCDate() - 1);
  return midnight.toISOString().slice(0, 10);
}

function dayLabel(day: string, today: string, timeZone: string, sample: Date): string {
  if (day === today) return "Today";
  if (day === previousDay(today)) return "Yesterday";
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: sameYear ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
  }).format(sample);
}

/** Order is kept: items are assumed newest first, and groups come out in that order. */
export function groupByDay<T extends { createdAt: Date }>(
  items: readonly T[],
  now: Date,
  timeZone: string,
): DayGroup<T>[] {
  const today = calendarDay(now, timeZone);
  const groups: DayGroup<T>[] = [];

  for (const item of items) {
    const day = calendarDay(item.createdAt, timeZone);
    const last = groups.at(-1);
    if (last && last.day === day) {
      last.items.push(item);
    } else {
      groups.push({ day, label: dayLabel(day, today, timeZone, item.createdAt), items: [item] });
    }
  }

  return groups;
}

/** The time of day in the site's zone, 24-hour: "14:05". */
export function formatTimeOfDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}
