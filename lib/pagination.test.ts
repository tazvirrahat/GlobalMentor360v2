import { describe, expect, it } from "vitest";
import { clampPage, pageCount, pageHref, parsePage, showingRange, skipTake } from "./pagination";

/**
 * Shared ?page= math. Every list that grew a silent cap now pages through the
 * same helpers, so an off-by-one here would hide the last admin refund or skip
 * a catalog card on every surface at once.
 */

describe("parsePage", () => {
  it("treats missing, blank, and non-numeric input as page 1", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage(null)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("nope")).toBe(1);
    expect(parsePage(Number.NaN)).toBe(1);
  });

  it("rejects zero, negatives, and fractions rather than skipping backwards", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("2.9")).toBe(2);
    expect(parsePage(4)).toBe(4);
  });
});

describe("pageCount", () => {
  it("is 1 for an empty list so the UI never says page 1 of 0", () => {
    expect(pageCount(0, 40)).toBe(1);
  });

  it("rounds up a partial last page", () => {
    expect(pageCount(40, 40)).toBe(1);
    expect(pageCount(41, 40)).toBe(2);
    expect(pageCount(80, 40)).toBe(2);
  });
});

describe("skipTake", () => {
  it("starts page 1 at offset 0", () => {
    expect(skipTake(1, 40)).toEqual({ skip: 0, take: 40 });
  });

  it("offsets page 2 by one full page so older rows become reachable", () => {
    expect(skipTake(2, 40)).toEqual({ skip: 40, take: 40 });
    expect(skipTake(3, 20)).toEqual({ skip: 40, take: 20 });
  });
});

describe("clampPage", () => {
  it("keeps a valid page and folds an overshoot onto the last page", () => {
    expect(clampPage(1, 80, 40)).toBe(1);
    expect(clampPage(3, 80, 40)).toBe(2);
    expect(clampPage(99, 0, 40)).toBe(1);
  });
});

describe("showingRange", () => {
  it("is 0–0 when there is nothing to show", () => {
    expect(showingRange(1, 48, 0)).toEqual({ from: 0, to: 0 });
  });

  it("describes the inclusive slice on the first and last pages", () => {
    expect(showingRange(1, 48, 100)).toEqual({ from: 1, to: 48 });
    expect(showingRange(3, 48, 100)).toEqual({ from: 97, to: 100 });
  });
});

describe("pageHref", () => {
  it("omits page=1 so the first page stays the canonical URL", () => {
    expect(pageHref("/admin/users", { q: "ada" }, 1)).toEqual({
      pathname: "/admin/users",
      query: { q: "ada" },
    });
  });

  it("adds ?page= on later pages and keeps the other filters", () => {
    expect(pageHref("/courses", { q: "sql", sort: "relevance" }, 2)).toEqual({
      pathname: "/courses",
      query: { q: "sql", sort: "relevance", page: "2" },
    });
  });
});
