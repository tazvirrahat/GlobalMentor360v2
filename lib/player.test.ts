import { describe, expect, it } from "vitest";
import { activeCueIndex, formatClock, parseClock, pickTab, qualityOptions } from "./player";

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

describe("qualityOptions", () => {
  it("offers Auto, then one entry per height, highest first", () => {
    const levels = [{ height: 480 }, { height: 720 }, { height: 720 }, { height: 0 }];
    expect(qualityOptions(levels)).toEqual([
      { value: -1, label: "Auto" },
      { value: 1, label: "720p" },
      { value: 0, label: "480p" },
    ]);
  });

  it("is just Auto with no usable levels", () => {
    expect(qualityOptions([])).toEqual([{ value: -1, label: "Auto" }]);
  });
});

describe("activeCueIndex", () => {
  const cues = [
    { start: 1, end: 4.25 },
    { start: 5.5, end: 7 },
    { start: 7, end: 9 },
  ];
  it("finds the cue under the playhead, and -1 before, between and after", () => {
    expect(activeCueIndex(cues, 0)).toBe(-1);
    expect(activeCueIndex(cues, 1)).toBe(0);
    expect(activeCueIndex(cues, 4)).toBe(0);
    expect(activeCueIndex(cues, 5)).toBe(-1);
    expect(activeCueIndex(cues, 7)).toBe(2);
    expect(activeCueIndex(cues, 10)).toBe(-1);
    expect(activeCueIndex(cues, null)).toBe(-1);
  });
});
