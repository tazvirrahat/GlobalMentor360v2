import { describe, expect, it } from "vitest";
import { DURATION_BUCKETS, durationBucket, parseDurationBucket } from "./catalog-duration";

describe("parseDurationBucket", () => {
  it("accepts the four buckets and nothing else", () => {
    expect(parseDurationBucket("short")).toBe("short");
    expect(parseDurationBucket("extra")).toBe("extra");
    expect(parseDurationBucket("")).toBeUndefined();
    expect(parseDurationBucket(undefined)).toBeUndefined();
    expect(parseDurationBucket("forever")).toBeUndefined();
  });
});

describe("DURATION_BUCKETS", () => {
  it("covers every length with no gaps or overlaps", () => {
    for (let index = 1; index < DURATION_BUCKETS.length; index++) {
      expect(DURATION_BUCKETS[index]!.minSeconds).toBe(DURATION_BUCKETS[index - 1]!.maxSeconds);
    }
    expect(DURATION_BUCKETS[0]!.minSeconds).toBe(0);
    expect(DURATION_BUCKETS.at(-1)!.maxSeconds).toBeNull();
    expect(durationBucket("medium").label).toBe("1 to 3 hours");
  });
});
