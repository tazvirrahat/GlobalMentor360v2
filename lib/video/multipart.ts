/**
 * Resumable video uploads are S3 multipart uploads: the file goes up in parts
 * the browser can retry one at a time, and an interrupted upload continues from
 * the parts S3 already holds. Pure planning helpers only.
 */

const MiB = 1024 * 1024;

/** S3's floor for every part but the last. */
export const MIN_PART_BYTES = 5 * MiB;
export const DEFAULT_PART_BYTES = 16 * MiB;
/** S3's ceiling on parts per upload. */
export const MAX_PARTS = 10_000;
/** Part URLs signed per request. */
export const MAX_PARTS_PER_SIGN = 50;
/** A sane ceiling for a lecture video. */
export const VIDEO_MAX_BYTES = 50 * 1024 * MiB;

/** 16 MB parts, grown in whole MB when a file would need more than 10,000. */
export function planUpload(size: number): { partSize: number; partCount: number } {
  const partSize = Math.max(DEFAULT_PART_BYTES, Math.ceil(size / MAX_PARTS / MiB) * MiB);
  return { partSize, partCount: Math.max(1, Math.ceil(size / partSize)) };
}

/** Byte range [start, end) of a 1-based part. */
export function partRange(partNumber: number, partSize: number, size: number): { start: number; end: number } {
  const start = (partNumber - 1) * partSize;
  return { start, end: Math.min(size, start + partSize) };
}

/** Part numbers 1…partCount not yet uploaded, in order. */
export function missingParts(partCount: number, done: readonly number[]): number[] {
  const have = new Set(done);
  const out: number[] = [];
  for (let n = 1; n <= partCount; n++) if (!have.has(n)) out.push(n);
  return out;
}

/** A request for part URLs: whole numbers within the upload, no repeats, at most 50. */
export function isValidPartRequest(partNumbers: unknown, partCount: number): partNumbers is number[] {
  if (!Array.isArray(partNumbers) || partNumbers.length === 0 || partNumbers.length > MAX_PARTS_PER_SIGN) return false;
  const seen = new Set<number>();
  for (const n of partNumbers) {
    if (!Number.isInteger(n) || n < 1 || n > Math.min(partCount, MAX_PARTS) || seen.has(n)) return false;
    seen.add(n);
  }
  return true;
}
