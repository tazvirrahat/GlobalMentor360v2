/**
 * Course length buckets for the catalog filter. A course's length is the sum
 * of its lectures' durations (video running time, or the reading estimate for
 * an article), the same number the course row shows. Min inclusive, max
 * exclusive, so every course falls in exactly one bucket.
 */

export const DURATION_BUCKETS = [
  { value: "short", label: "Under 1 hour", minSeconds: 0, maxSeconds: 3600 },
  { value: "medium", label: "1 to 3 hours", minSeconds: 3600, maxSeconds: 3 * 3600 },
  { value: "long", label: "3 to 6 hours", minSeconds: 3 * 3600, maxSeconds: 6 * 3600 },
  { value: "extra", label: "Over 6 hours", minSeconds: 6 * 3600, maxSeconds: null },
] as const;

export type DurationBucket = (typeof DURATION_BUCKETS)[number]["value"];

export function parseDurationBucket(raw: string | undefined): DurationBucket | undefined {
  return DURATION_BUCKETS.find((bucket) => bucket.value === raw)?.value;
}

export function durationBucket(value: DurationBucket) {
  return DURATION_BUCKETS.find((bucket) => bucket.value === value)!;
}
