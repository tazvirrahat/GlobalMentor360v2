import { describe, expect, it } from "vitest";
import { isTimeZone, timeZoneLabel } from "./time-zones";

describe("time zones", () => {
  it("accepts real zones and refuses anything else", () => {
    expect(isTimeZone("Asia/Dhaka")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });

  it("labels a zone by its city and offset", () => {
    expect(timeZoneLabel("Asia/Dhaka")).toBe("Dhaka (GMT+6)");
    expect(timeZoneLabel("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe("New York (GMT-5)");
  });
});
