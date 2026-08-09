import { describe, expect, it } from "vitest";
import { isValidRating, reviewSubmissionSchema, summariseRatings } from "./reviews";

/**
 * Course.ratingAverage / ratingCount are display-only aggregates recomputed from
 * the Review rows, so what is worth testing is the arithmetic between the GROUP
 * BY and the page: what an empty set averages to, what a rating outside 1-5 does
 * to the histogram, and that the bars and the headline count agree.
 *
 * The expectations below are written out as literals rather than recomputed from
 * the input — a test that re-derives the answer the same way the code does only
 * proves the two copies match.
 */

/** GROUP BY output for a fixed set of reviews, in the shape Prisma returns. */
const buckets = (...pairs: [rating: number, count: number][]) =>
  pairs.map(([rating, count]) => ({ rating, count }));

describe("isValidRating", () => {
  it("accepts every star a review may carry", () => {
    expect([1, 2, 3, 4, 5].every(isValidRating)).toBe(true);
  });

  it("rejects the values that would silently skew an average", () => {
    // reviews.rating is a plain Int — nothing below this guard would refuse them.
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(99)).toBe(false);
    expect(isValidRating(-3)).toBe(false);
  });

  it("rejects a rating that is not a whole star", () => {
    expect(isValidRating(4.5)).toBe(false);
    expect(isValidRating(Number.NaN)).toBe(false);
  });
});

describe("reviewSubmissionSchema", () => {
  it("coerces the string a form actually posts", () => {
    const parsed = reviewSubmissionSchema.safeParse({
      courseId: "course-1",
      rating: "4",
      body: "  Solid course.  ",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.rating).toBe(4);
    expect(parsed.data?.body).toBe("Solid course.");
  });

  it("refuses a rating outside 1-5 from a hand-rolled POST", () => {
    expect(
      reviewSubmissionSchema.safeParse({ courseId: "course-1", rating: "99" }).success,
    ).toBe(false);
    expect(reviewSubmissionSchema.safeParse({ courseId: "course-1", rating: "0" }).success).toBe(
      false,
    );
  });

  it("refuses a missing rating rather than coercing it to zero", () => {
    expect(reviewSubmissionSchema.safeParse({ courseId: "course-1", rating: "" }).success).toBe(
      false,
    );
  });

  it("accepts a rating with no written body", () => {
    const parsed = reviewSubmissionSchema.safeParse({
      courseId: "course-1",
      rating: "5",
      body: "",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("summariseRatings", () => {
  it("averages a mixed set", () => {
    // 5,5,4,3 => 17/4
    const summary = summariseRatings(buckets([5, 2], [4, 1], [3, 1]));
    expect(summary.count).toBe(4);
    expect(summary.average).toBe(4.25);
  });

  it("rounds a repeating average to two decimals", () => {
    // 5,4,4 => 13/3 = 4.333...
    const summary = summariseRatings(buckets([5, 1], [4, 2]));
    expect(summary.average).toBe(4.33);
  });

  it("reports zero rather than NaN when the last visible review is hidden", () => {
    const summary = summariseRatings([]);
    expect(summary.count).toBe(0);
    expect(summary.average).toBe(0);
    expect(Number.isNaN(summary.average)).toBe(false);
  });

  it("renders five empty bars for a course with no reviews", () => {
    const summary = summariseRatings([]);
    expect(summary.distribution).toEqual([
      { rating: 5, count: 0, percent: 0 },
      { rating: 4, count: 0, percent: 0 },
      { rating: 3, count: 0, percent: 0 },
      { rating: 2, count: 0, percent: 0 },
      { rating: 1, count: 0, percent: 0 },
    ]);
  });

  it("orders the histogram best first", () => {
    const summary = summariseRatings(buckets([1, 1], [5, 1]));
    expect(summary.distribution.map((bar) => bar.rating)).toEqual([5, 4, 3, 2, 1]);
  });

  it("buckets each star into its own bar", () => {
    const summary = summariseRatings(buckets([5, 6], [3, 2], [1, 2]));
    expect(summary.distribution).toEqual([
      { rating: 5, count: 6, percent: 60 },
      { rating: 4, count: 0, percent: 0 },
      { rating: 3, count: 2, percent: 20 },
      { rating: 2, count: 0, percent: 0 },
      { rating: 1, count: 2, percent: 20 },
    ]);
  });

  it("rounds bar percentages to one decimal", () => {
    // 1 of 3 = 33.333...%
    const summary = summariseRatings(buckets([5, 1], [4, 1], [3, 1]));
    expect(summary.distribution[0]?.percent).toBe(33.3);
  });

  it("keeps the bars summing to the headline count", () => {
    const summary = summariseRatings(buckets([5, 3], [4, 7], [2, 1]));
    const barTotal = summary.distribution.reduce((sum, bar) => sum + bar.count, 0);
    expect(barTotal).toBe(11);
    expect(summary.count).toBe(11);
  });

  it("drops a rating no bar accounts for instead of letting it move the average", () => {
    // A 99 predating isValidRating would otherwise average 5,5,99 to 36.33.
    const summary = summariseRatings(buckets([5, 2], [99, 1]));
    expect(summary.count).toBe(2);
    expect(summary.average).toBe(5);
  });

  it("handles a single review", () => {
    const summary = summariseRatings(buckets([2, 1]));
    expect(summary.average).toBe(2);
    expect(summary.count).toBe(1);
    expect(summary.distribution[3]).toEqual({ rating: 2, count: 1, percent: 100 });
  });
});
