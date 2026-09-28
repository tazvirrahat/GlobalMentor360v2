import { describe, expect, it } from "vitest";
import { formatDateMedium, formatDuration, formatHoursMinutes, formatLessonMinutes, formatPrice, formatPriceParts } from "./format";

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

describe("formatPrice", () => {
  it("writes taka with the symbol and no decimals on whole amounts", () => {
    expect(formatPrice(599000, "BDT")).toBe("৳5,990");
    expect(formatPrice(359100, "BDT")).toBe("৳3,591");
    expect(formatPrice(359150, "BDT")).toBe("৳3,591.50");
  });

  it("writes dollars as $49", () => {
    expect(formatPrice(4900, "USD")).toBe("$49");
    expect(formatPrice(0, "USD")).toBe("$0");
  });
});

describe("formatPriceParts", () => {
  it("joins back to formatPrice and marks only the thousands separators", () => {
    for (const [amount, currency] of [[599000, "BDT"], [123456789, "BDT"], [4900, "USD"], [359150, "BDT"]] as const) {
      const parts = formatPriceParts(amount, currency);
      expect(parts.map((p) => p.text).join("")).toBe(formatPrice(amount, currency));
      expect(parts.filter((p) => p.separator).every((p) => p.text === ",")).toBe(true);
    }
  });
});

describe("formatDuration", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  it("picks minutes, then hours, then days", () => {
    expect(formatDuration(new Date("2026-09-25T11:59:40Z"), now)).toBe("1 minute");
    expect(formatDuration(new Date("2026-09-25T11:15:00Z"), now)).toBe("45 minutes");
    expect(formatDuration(new Date("2026-09-25T09:00:00Z"), now)).toBe("3 hours");
    expect(formatDuration(new Date("2026-09-23T11:00:00Z"), now)).toBe("2 days");
  });
});

describe("date time zones", () => {
  // 20:00 UTC on 24 Sept is already 25 Sept in Dhaka.
  const late = new Date("2026-09-24T20:00:00Z");
  it("uses the site's time zone by default, and the one given otherwise", () => {
    expect(formatDateMedium(late)).toBe(formatDateMedium(late, "Asia/Dhaka"));
    expect(formatDateMedium(late, "Asia/Dhaka")).toMatch(/^25 /);
    expect(formatDateMedium(late, "UTC")).toMatch(/^24 /);
  });
});
