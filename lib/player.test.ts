import { describe, expect, it } from "vitest";
import { formatClock, parseClock, pickTab } from "./player";

describe("pickTab", () => {
  it("keeps a known, available tab and falls back to the first", () => {
    expect(pickTab("qa", ["overview", "qa", "notes"])).toBe("qa");
    expect(pickTab("announcements", ["overview", "qa"])).toBe("overview");
    expect(pickTab("nonsense", ["overview"])).toBe("overview");
    expect(pickTab(undefined, ["overview", "qa"])).toBe("overview");
  });
});

describe("formatClock", () => {
  it("writes m:ss, and h:mm:ss past an hour", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(599.9)).toBe("9:59");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

describe("parseClock", () => {
  it("reads m:ss, h:mm:ss and bare seconds", () => {
    expect(parseClock("1:15")).toBe(75);
    expect(parseClock(" 0:05 ")).toBe(5);
    expect(parseClock("75")).toBe(75);
    expect(parseClock("1:02:05")).toBe(3725);
    expect(parseClock("")).toBe(0);
  });

  it("rejects what is not a time", () => {
    expect(parseClock("x")).toBeNull();
    expect(parseClock("1:75")).toBeNull();
    expect(parseClock("-3")).toBeNull();
    expect(parseClock("1::2")).toBeNull();
  });
});
