/**
 * Time zones for the account page. Client-safe and pure: the few zones most
 * learners here live in come first, then every zone the runtime knows.
 */

export const COMMON_TIME_ZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Europe/London",
  "America/New_York",
  "America/Toronto",
  "Australia/Sydney",
] as const;

export function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [...COMMON_TIME_ZONES];
  }
}

/** True for a zone Intl accepts. */
export function isTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** "Asia/Dhaka" → "Dhaka (GMT+6)", for the select. */
export function timeZoneLabel(zone: string, now: Date = new Date()): string {
  const city = zone.split("/").pop()!.replace(/_/g, " ");
  const offset =
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  return offset ? `${city} (${offset})` : city;
}
