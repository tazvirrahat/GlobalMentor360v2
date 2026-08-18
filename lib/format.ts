/**
 * Display formatting shared across catalog, checkout, studio, and admin.
 *
 * Locale is fixed to en-GB rather than the request's: these helpers render
 * inside Server Components, so a locale-dependent string would be chosen by
 * the server's environment and then differ from what a client re-render
 * produces.
 */

const DATE_LOCALE = "en-GB";

export function formatPrice(amount: number, currency: string): string {
  // Amounts are stored as integer minor units.
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount / 100);
}

/** Catalog duration: "2h 15m" / "45m" / "3h". Not mm:ss — that stays local to the uploader. */
export function formatHoursMinutes(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(DATE_LOCALE);
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString(DATE_LOCALE);
}

const DATE_MEDIUM = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateMedium(date: Date): string {
  return DATE_MEDIUM.format(date);
}

export function formatDateLong(date: Date): string {
  return date.toLocaleDateString(DATE_LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
