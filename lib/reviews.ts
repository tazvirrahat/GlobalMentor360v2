import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ModerationStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { canReview } from "@/lib/entitlement";

/**
 * Course reviews and the rating aggregates every catalog surface renders.
 *
 * INVARIANT 4 (docs/TECH-SPEC.md#invariants): a review requires a live
 * enrollment. The check lives in `saveReview`, not in the page that decides
 * whether to render the form. A server action is a POST endpoint reachable
 * without ever loading the page, so hiding the form hides nothing.
 *
 * Course.ratingAverage / ratingCount are denormalised because the catalog grid
 * renders them once per card and must not pay for an aggregate query per card.
 * They are recomputed from the Review rows on every write — never incremented.
 */

/** Every rating a review may carry, ascending. */
const RATING_VALUES: readonly number[] = [1, 2, 3, 4, 5];

/**
 * The only ratings that exist.
 *
 * `reviews.rating` is a plain Int with no CHECK constraint, so this is the whole
 * guard: a 0 or a 99 that reaches the table skews the average shown on every
 * catalog card, silently and permanently, because nothing downstream re-derives
 * it from anything sane. Both the zod schema and `saveReview` call this rather
 * than each spelling out the range, so the two cannot drift apart.
 */
export function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

export const reviewSubmissionSchema = z.object({
  courseId: z.string().min(1),
  rating: z.coerce.number().refine(isValidRating, "Choose a rating from 1 to 5."),
  body: z.string().trim().max(4000, "Keep your review under 4000 characters.").optional(),
});

export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;

export type RatingBucket = { rating: number; count: number };

export type RatingBar = { rating: number; count: number; percent: number };

export type RatingSummary = {
  /** Rounded to two decimals; every surface renders one. */
  average: number;
  count: number;
  /** One bar per star value, best first — the order the histogram renders. */
  distribution: RatingBar[];
};

/**
 * Turns grouped rating counts into the numbers the page renders.
 *
 * Pure, and separate from the query, because the interesting cases are the ones
 * a database round trip makes tedious to reach: no reviews at all, one review,
 * and a rating outside 1-5 that predates the guard above.
 */
export function summariseRatings(buckets: readonly RatingBucket[]): RatingSummary {
  const counts = new Map<number, number>();

  for (const bucket of buckets) {
    // A rating no bar accounts for would still drag the average, so the display
    // and the headline number would disagree with no way to see why.
    if (!isValidRating(bucket.rating)) continue;
    counts.set(bucket.rating, (counts.get(bucket.rating) ?? 0) + bucket.count);
  }

  let count = 0;
  let total = 0;
  for (const [rating, bucketCount] of counts) {
    count += bucketCount;
    total += rating * bucketCount;
  }

  // Hiding the last visible review leaves zero rows, and 0/0 is how the hero
  // ends up rendering "NaN out of 5".
  const average = count === 0 ? 0 : Math.round((total / count) * 100) / 100;

  const distribution = [...RATING_VALUES].reverse().map((rating): RatingBar => {
    const bucketCount = counts.get(rating) ?? 0;
    return {
      rating,
      count: bucketCount,
      percent: count === 0 ? 0 : Math.round((bucketCount / count) * 1000) / 10,
    };
  });

  return { average, count, distribution };
}

type Client = Prisma.TransactionClient | typeof db;

/**
 * Runs `work` atomically, so the Review row and the Course aggregates always
 * commit or roll back together. Same shape as lib/enrollment.ts: atomicity is
 * decided by whether the caller supplied a client, never by inspecting one.
 */
function inTransaction<T>(client: Client | undefined, work: (tx: Client) => Promise<T>): Promise<T> {
  return client ? work(client) : db.$transaction((tx) => work(tx));
}

/**
 * Rewrites Course.ratingAverage / ratingCount from the Review rows.
 *
 * Recomputed rather than adjusted by a delta, per prisma/schema.prisma:222. An
 * incrementing counter has to know what the previous rating was to move the
 * average correctly on an edit, and a hide has to know whether the row it hid
 * was already counted — both are decisions taken from an unlocked read, the
 * check-then-act shape lib/enrollment.ts records as having inflated
 * enrollmentCount. Recomputing has no previous value to be wrong about.
 */
export async function recomputeCourseRating(
  courseId: string,
  /** Omit to get a fresh transaction; pass your own when already inside one. */
  client?: Client,
): Promise<RatingSummary> {
  return inTransaction(client, async (tx) => {
    // Serialises recomputes for one course. Recomputing from the rows removes
    // the check-then-act race but not the snapshot one: under READ COMMITTED,
    // two transactions that each insert a review before the other commits would
    // both aggregate without seeing the other's row, and the last to commit
    // would store a count short by one. Taking the course row first means the
    // second transaction's GROUP BY — a new statement, so a new snapshot — sees
    // the first one's committed review.
    await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId} FOR UPDATE`;

    // One grouped query rather than one row per review: this runs on the write
    // path of a page whose read cost must not grow with a course's popularity.
    const buckets = await tx.review.groupBy({
      by: ["rating"],
      where: { courseId, status: "VISIBLE" },
      _count: { _all: true },
    });

    const summary = summariseRatings(
      buckets.map((bucket) => ({ rating: bucket.rating, count: bucket._count._all })),
    );

    await tx.course.update({
      where: { id: courseId },
      data: { ratingAverage: summary.average, ratingCount: summary.count },
    });

    return summary;
  });
}

export type ReviewWriteResult =
  | { ok: true; summary: RatingSummary }
  | { ok: false; message: string };

/**
 * Creates or updates one learner's review, then rewrites the course aggregates
 * in the same transaction.
 */
export async function saveReview(input: {
  userId: string;
  courseId: string;
  rating: number;
  body: string | null;
}): Promise<ReviewWriteResult> {
  if (!isValidRating(input.rating)) {
    return { ok: false, message: "Choose a rating from 1 to 5." };
  }

  // INVARIANT 4. canReview reads the enrollment row and nothing else, so a
  // learner who was refunded — enrolled once, revoked since — is refused here
  // even though the form was legitimately rendered for them earlier.
  if (!(await canReview(input.userId, input.courseId))) {
    return { ok: false, message: "Only enrolled learners can review this course." };
  }

  const summary = await db.$transaction(async (tx) => {
    // upsert, not create: @@unique([userId, courseId]) makes a second review a
    // constraint violation, and a learner changing their mind is the normal
    // case rather than an error to surface.
    await tx.review.upsert({
      where: { userId_courseId: { userId: input.userId, courseId: input.courseId } },
      create: {
        userId: input.userId,
        courseId: input.courseId,
        rating: input.rating,
        body: input.body,
      },
      // `status` is deliberately absent from the update: a moderator's HIDDEN
      // has to survive the author editing their own review, or moderation is
      // one edit away from undone.
      update: { rating: input.rating, body: input.body },
    });

    return recomputeCourseRating(input.courseId, tx);
  });

  return { ok: true, summary };
}

export type CourseReview = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
  authorName: string;
};

export type OwnReview = {
  rating: number;
  body: string | null;
  status: ModerationStatus;
};

export type CourseReviewPanel = {
  summary: RatingSummary;
  reviews: CourseReview[];
  /** The signed-in learner's own review, if they have written one. */
  ownReview: OwnReview | null;
  /** Visible reviews beyond the page rendered, so the count can be honest. */
  hiddenByPageSize: number;
};

/**
 * The landing page renders one review at a time but is a public, SEO-critical
 * page, so the query count has to be constant. A course with 4000 reviews costs
 * exactly what a course with four costs.
 */
const REVIEW_PAGE_SIZE = 20;

/**
 * Everything the landing page's review section needs, in three queries that do
 * not multiply with the number of reviews (two when signed out).
 */
export async function getCourseReviewPanel(
  courseId: string,
  userId: string | null,
): Promise<CourseReviewPanel> {
  const [buckets, rows, own] = await Promise.all([
    db.review.groupBy({
      by: ["rating"],
      where: { courseId, status: "VISIBLE" },
      _count: { _all: true },
    }),
    db.review.findMany({
      where: { courseId, status: "VISIBLE" },
      orderBy: { createdAt: "desc" },
      take: REVIEW_PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { name: true } },
      },
    }),
    // Deliberately unfiltered on status: a learner whose review was hidden still
    // gets their own text back in the form, rather than a blank box that looks
    // like their review was lost and invites them to write it again.
    userId
      ? db.review.findUnique({
          where: { userId_courseId: { userId, courseId } },
          select: { rating: true, body: true, status: true },
        })
      : Promise.resolve(null),
  ]);

  const summary = summariseRatings(
    buckets.map((bucket) => ({ rating: bucket.rating, count: bucket._count._all })),
  );

  return {
    summary,
    reviews: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      authorName: row.user.name,
    })),
    ownReview: own,
    hiddenByPageSize: Math.max(0, summary.count - rows.length),
  };
}
