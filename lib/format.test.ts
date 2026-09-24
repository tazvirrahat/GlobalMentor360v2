import { describe, expect, it } from "vitest";
import { formatHoursMinutes, formatLessonMinutes } from "./format";

describe("formatLessonMinutes", () => {
  it("rounds to whole minutes and never says 0", () => {
    expect(formatLessonMinutes(420)).toBe("7 min");
    expect(formatLessonMinutes(450)).toBe("8 min");
    expect(formatLessonMinutes(20)).toBe("1 min");
  });
});

describe("formatHoursMinutes", () => {
  it("drops the empty unit", () => {
    expect(formatHoursMinutes(2700)).toBe("45m");
    expect(formatHoursMinutes(7200)).toBe("2h");
    expect(formatHoursMinutes(8100)).toBe("2h 15m");
  });
});
