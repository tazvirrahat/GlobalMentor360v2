import { describe, expect, it } from "vitest";
import { biggestDrop, monthLabel, monthStarts, percentOf, weekLabel, weekStarts } from "./course-analytics-rules";

const DHAKA = "Asia/Dhaka";

describe("weekStarts", () => {
  it("ends with this week's Monday and goes back a week at a time", () => {
    // Thursday 25 September 2026, midday in Dhaka.
    expect(weekStarts(new Date("2026-09-25T06:00:00Z"), 3, DHAKA)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("uses Dhaka's calendar: 20:00 UTC on a Sunday is already Monday there", () => {
    expect(weekStarts(new Date("2026-09-27T20:00:00Z"), 1, DHAKA)).toEqual(["2026-09-28"]);
    expect(weekStarts(new Date("2026-09-27T17:00:00Z"), 1, DHAKA)).toEqual(["2026-09-21"]);
  });

  it("crosses a year boundary", () => {
    expect(weekStarts(new Date("2027-01-02T06:00:00Z"), 2, DHAKA)).toEqual(["2026-12-21", "2026-12-28"]);
  });
});

describe("monthStarts", () => {
  it("counts back across a year", () => {
    expect(monthStarts(new Date("2026-02-10T06:00:00Z"), 4, DHAKA)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("uses Dhaka's calendar at the end of a month", () => {
    expect(monthStarts(new Date("2026-09-30T19:00:00Z"), 1, DHAKA)).toEqual(["2026-10"]);
  });
});

describe("labels", () => {
  it("reads like a date, not a key", () => {
    expect(weekLabel("2026-03-02")).toBe("2 Mar");
    expect(monthLabel("2026-03")).toBe("Mar 2026");
  });
});

describe("percentOf", () => {
  it("floors, and is 0 with nobody to count", () => {
    expect(percentOf(199, 200)).toBe(99);
    expect(percentOf(3, 0)).toBe(0);
  });
});

describe("biggestDrop", () => {
  it("names the step where the most learners stop", () => {
    const items = [
      { title: "Welcome", completed: 10 },
      { title: "Types", completed: 9 },
      { title: "Generics", completed: 4 },
      { title: "Quiz", completed: 3 },
    ];
    expect(biggestDrop(items, 10)).toEqual({ after: "Types", before: "Generics", points: 50 });
  });

  it("is null when nobody drops", () => {
    expect(biggestDrop([{ title: "A", completed: 2 }, { title: "B", completed: 2 }], 2)).toBeNull();
    expect(biggestDrop([{ title: "A", completed: 2 }], 2)).toBeNull();
  });
});
