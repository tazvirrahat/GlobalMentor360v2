import { describe, expect, it } from "vitest";
import { formatTimeOfDay, groupByDay } from "./day-groups";

const DHAKA = "Asia/Dhaka"; // UTC+6, no daylight saving
const now = new Date("2026-09-24T10:00:00Z"); // 16:00 in Dhaka

function at(iso: string) {
  return { id: iso, createdAt: new Date(iso) };
}

describe("groupByDay", () => {
  it("labels today and yesterday, then dates, keeping the input order", () => {
    const groups = groupByDay(
      [
        at("2026-09-24T09:00:00Z"),
        at("2026-09-24T01:00:00Z"),
        at("2026-09-23T12:00:00Z"),
        at("2026-09-20T05:00:00Z"),
      ],
      now,
      DHAKA,
    );
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Sunday 20 September", 1],
    ]);
    expect(groups[0]?.day).toBe("2026-09-24");
  });

  it("uses the site's calendar day, not UTC's", () => {
    // 20:00 UTC on the 23rd is 02:00 on the 24th in Dhaka.
    const [group] = groupByDay([at("2026-09-23T20:00:00Z")], now, DHAKA);
    expect(group?.label).toBe("Today");
    // 17:59 UTC on the 23rd is 23:59 on the 23rd in Dhaka.
    const [late] = groupByDay([at("2026-09-23T17:59:00Z")], now, DHAKA);
    expect(late?.label).toBe("Yesterday");
  });

  it("works out yesterday across a month and a year boundary", () => {
    const newYear = new Date("2027-01-01T06:00:00Z");
    const [group] = groupByDay([at("2026-12-31T06:00:00Z")], newYear, DHAKA);
    expect(group?.label).toBe("Yesterday");
  });

  it("adds the year to dates from another year", () => {
    const [group] = groupByDay([at("2025-11-02T06:00:00Z")], now, DHAKA);
    expect(group?.label).toBe("2 November 2025");
  });

  it("returns no groups for no items", () => {
    expect(groupByDay([], now, DHAKA)).toEqual([]);
  });
});

describe("formatTimeOfDay", () => {
  it("shows 24-hour time in the site's zone", () => {
    expect(formatTimeOfDay(new Date("2026-09-24T08:05:00Z"), DHAKA)).toBe("14:05");
  });
});
