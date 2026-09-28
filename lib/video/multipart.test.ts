import { describe, expect, it } from "vitest";
import { DEFAULT_PART_BYTES, isValidPartRequest, MAX_PARTS, missingParts, partRange, planUpload } from "./multipart";

const MiB = 1024 * 1024;

describe("planUpload", () => {
  it("uses 16 MB parts, and at least one part", () => {
    expect(planUpload(100 * MiB)).toEqual({ partSize: DEFAULT_PART_BYTES, partCount: 7 });
    expect(planUpload(1)).toEqual({ partSize: DEFAULT_PART_BYTES, partCount: 1 });
  });

  it("grows parts so a huge file stays within 10,000", () => {
    const size = 300 * 1024 * MiB;
    const plan = planUpload(size);
    expect(plan.partCount).toBeLessThanOrEqual(MAX_PARTS);
    expect(plan.partSize % MiB).toBe(0);
    expect(plan.partSize * plan.partCount).toBeGreaterThanOrEqual(size);
  });
});

describe("partRange and missingParts", () => {
  it("cuts the last part short", () => {
    expect(partRange(1, 10, 25)).toEqual({ start: 0, end: 10 });
    expect(partRange(3, 10, 25)).toEqual({ start: 20, end: 25 });
  });

  it("lists what is left to send", () => {
    expect(missingParts(5, [1, 3])).toEqual([2, 4, 5]);
    expect(missingParts(2, [1, 2])).toEqual([]);
  });
});

describe("isValidPartRequest", () => {
  it("accepts whole part numbers within the upload", () => {
    expect(isValidPartRequest([1, 2, 3], 3)).toBe(true);
  });

  it("refuses out-of-range, repeated, fractional, empty or oversized requests", () => {
    expect(isValidPartRequest([0], 3)).toBe(false);
    expect(isValidPartRequest([4], 3)).toBe(false);
    expect(isValidPartRequest([1, 1], 3)).toBe(false);
    expect(isValidPartRequest([1.5], 3)).toBe(false);
    expect(isValidPartRequest([], 3)).toBe(false);
    expect(isValidPartRequest(Array.from({ length: 51 }, (_, i) => i + 1), 100)).toBe(false);
    expect(isValidPartRequest("1", 3)).toBe(false);
  });
});
