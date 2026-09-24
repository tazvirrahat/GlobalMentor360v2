/**
 * Display formatting shared across catalog, checkout, studio, and admin.
 *
 * Locale is fixed to en-GB rather than the request's: these helpers render
 * inside Server Components, so a locale-dependent string would be chosen by
 * the server's environment and then differ from what a client re-render
 * produces.
 */

const DATE_LOCALE = "en-GB";

function priceFormat(amount: number, currency: string) {
  // Amounts are integer minor units. Written the way a course marketplace
  // writes them: the narrow symbol (৳, $), and no ".00" on whole amounts.
  const whole = amount % 100 === 0;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatPrice(amount: number, currency: string): string {
  return priceFormat(amount, currency).format(amount / 100);
}

/**
 * The same string in pieces, so the Price component can keep tabular digits
 * while the thousands separator stays proportional: Schibsted Grotesk's tnum
 * widens the comma to a figure width ("5 , 990").
 */
export function formatPriceParts(amount: number, currency: string): { text: string; separator: boolean }[] {
  return priceFormat(amount, currency)
    .formatToParts(amount / 100)
    .map((part) => ({ text: part.value, separator: part.type === "group" }));
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

/** A lesson's length in the curriculum: "7 min". Rounds, never shows 0. */
export function formatLessonMinutes(totalSeconds: number): string {
  return `${Math.max(1, Math.round(totalSeconds / 60))} min`;
}
