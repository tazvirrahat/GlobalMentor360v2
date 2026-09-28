import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ModerationStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { canReview } from "@/lib/entitlement";
import { notify } from "@/lib/notifications";
import { clampPage, pageCount, skipTake, type Paged } from "@/lib/pagination";
import { REVIEW_REPLY_MAX } from "@/lib/review-rules";

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
 *
 * That copy is authoritative only where an aggregate query is unaffordable, which
 * is the catalog grid and nothing else. It goes stale between writes: a `User`
 * delete cascades their reviews away and a moderator hiding one both change the
 * true average without touching a Review through `saveReview`. Any surface that
 * has already paid for `getCourseReviewPanel` must render `summary` instead —
 * showing both on one page is how a course ends up stating two averages at once.
 */

/** Every rating a review may carry, ascending. */
const RATING_VALUES: readonly number[] = [1, 2, 3, 4, 5];

/**
 * The only ratings that exist.
 *
 * The table also has CHECK (rating BETWEEN 1 AND 5) — see
 * prisma/migrations/20260817000003_schema_hardening — so a raw INSERT cannot
 * park a 0 or a 99 that would skew every catalog card. This function is still
 * the application guard: both the zod schema and `saveReview` call it rather
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
 * Recency weighting for ranking. A review's weight halves every RATING_HALF_LIFE_DAYS, counted
 * from its last edit, and Course.ratingScore = Σ wᵢ·rᵢ / Σ wᵢ over visible
 * reviews. "Highest rated" sorts by that score, so a course whose recent
 * learners are happier climbs and one coasting on old praise slips.
 *
 * The displayed average stays the flat mean below, for the reasons given
 * there: it has to agree with the histogram under it, and it is only ever
 * rewritten on a review write. The score, which only orders the catalog, is
 * refreshed on every review write and daily by `npm run ratings:recompute`.
 */
export const RATING_HALF_LIFE_DAYS = 365;

/** A review's weight at a given age: 1 when new, ½ after a half-life, ¼ after two. */
export function recencyWeight(ageDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / RATING_HALF_LIFE_DAYS);
}

/**
 * Turns grouped rating counts into the numbers the page renders.
 *
 * Pure, and separate from the query, because the interesting cases are the ones
 * a database round trip makes tedious to reach: no reviews at all, one review,
 * and a rating outside 1-5 that predates the guard above.
 *
 * A flat mean on purpose. FEATURES.md section F lists "rating aggregation,
 * distribution histogram, recency weighting" on one P0 line; the weighting
 * lives in the ranking score above rather than in this headline number.
 *
 * The obstacle is not choosing a decay curve, it is where the number is stored.
 * A time-weighted mean is a function of now(), and Course.ratingAverage is only
 * ever rewritten when someone writes a review. A course nobody has reviewed for
 * six months would keep serving the weighting it had at its last write, so the
 * catalog card and the "highest rated" sort (section B, P0) — which read that
 * column and cannot afford to recompute — would be wrong in a way that gets
 * worse the longer nothing happens. Recency weighting therefore costs a
 * scheduled recompute over every course, not an edit to this function.
 *
 * It would also put the headline at odds with the histogram directly beneath
 * it, which counts every review once: a 4.6 above bars that visibly average 4.1
 * reads as a bug, and a star summary has no room to explain the difference.
 *
 * A flat mean is the number a learner believes they are being shown; the
 * weighted one orders the catalog (Course.ratingScore) and is kept true by the
 * daily recompute.
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

/**
 * Runs `work` atomically, so the Review row and the Course aggregates always
 * commit or roll back together. Same shape as lib/enrollment.ts: atomicity is
 * decided by whether the caller supplied a client, never by inspecting one.
 *
 * The client is `Prisma.TransactionClient` and deliberately not the union with
 * `typeof db` that lib/enrollment.ts uses, because the two are not
 * interchangeable here. Handing in the base client turns this into a pass-through
 * and the row lock below then runs in its own implicit transaction, which
 * commits — releasing the lock — before the GROUP BY is even sent. That is
 * precisely the interleaving the lock exists to prevent, restored silently and
 * with no type error to notice. Narrowing makes it unrepresentable rather than
 * merely undocumented.
 */
function inTransaction<T>(
  client: Prisma.TransactionClient | undefined,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
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
  client?: Prisma.TransactionClient,
): Promise<RatingSummary> {
  return inTransaction(client, async (tx) => {
    // Serialises recomputes for one course. Recomputing from the rows removes
    // the check-then-act race but not the snapshot one: under READ COMMITTED,
    // two transactions that each insert a review before the other commits would
    // both aggregate without seeing the other's row, and the last to commit
    // would store a count short by one. Taking the course row first means the
    // second transaction's GROUP BY — a new statement, so a new snapshot — sees
    // the first one's committed review.
    //
    // FOR NO KEY UPDATE rather than FOR UPDATE, and the difference is not
    // cosmetic. Inserting a Review makes Postgres take FOR KEY SHARE on the
    // parent course row, so the course cannot be deleted out from under a row
    // that references it. FOR UPDATE conflicts with FOR KEY SHARE. Two learners
    // reviewing the same course at once therefore each held a KEY SHARE from
    // their own insert and then asked for a lock the other's insert blocked —
    // a cycle, which Postgres resolves by killing one transaction with 40P01
    // "deadlock detected". The stronger lock did not make the write safer; it
    // converted a lost update into a failed request, under exactly the
    // concurrency it was added for. FOR NO KEY UPDATE does not conflict with
    // FOR KEY SHARE, does conflict with itself — which is the entire
    // requirement — and is the same lock the UPDATE at the end of this function
    // takes anyway, because ratingAverage and ratingCount are in no key.
    //
    // tests/integration/reviews.test.ts fails with 40P01 if this is put back to
    // FOR UPDATE, and stores a count short by one if the lock is removed.
    await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId} FOR NO KEY UPDATE`;

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

    // The ranking score (see RATING_HALF_LIFE_DAYS): computed in SQL so the
    // weights use the database's clock, the same one the daily recompute uses.
    const [score] = await tx.$queryRaw<{ score: number | null }[]>`
      SELECT
        SUM(r.rating * power(0.5, EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - r."updatedAt")) / 86400.0 / ${RATING_HALF_LIFE_DAYS}))
          / NULLIF(SUM(power(0.5, EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - r."updatedAt")) / 86400.0 / ${RATING_HALF_LIFE_DAYS})), 0)
          AS score
      FROM reviews r
      WHERE r."courseId" = ${courseId} AND r.status = 'VISIBLE'
    `;

    await tx.course.update({
      where: { id: courseId },
      data: { ratingAverage: summary.average, ratingCount: summary.count, ratingScore: Number(score?.score ?? 0) },
    });

    return summary;
  });
}

/**
 * Refreshes every published course's ranking score. The weights depend on
 * the date, so a course nobody has reviewed lately drifts until this runs:
 * schedule `npm run ratings:recompute` daily.
 */
export async function recomputeAllCourseRatings(): Promise<number> {
  const courses = await db.course.findMany({ where: { ratingCount: { gt: 0 } }, select: { id: true } });
  for (const course of courses) await recomputeCourseRating(course.id);
  return courses.length;
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

export type ReviewReply = { body: string; createdAt: Date; responderName: string };

export type CourseReview = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
  authorName: string;
  /** The instructor's reply, shown under the review. */
  response: ReviewReply | null;
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
  page: number;
  pageCount: number;
};

/**
 * The landing page renders one review page at a time but is a public, SEO-critical
 * page, so the query count has to stay constant. A course with 4000 reviews costs
 * exactly what a course with four costs.
 */
export const REVIEW_PAGE_SIZE = 20;

/**
 * Everything the landing page's review section needs, in a constant number of
 * queries that do not multiply with the number of reviews (two when signed out).
 */
export async function getCourseReviewPanel(
  courseId: string,
  userId: string | null,
  page?: string | number,
): Promise<CourseReviewPanel> {
  const [buckets, own] = await Promise.all([
    db.review.groupBy({
      by: ["rating"],
      where: { courseId, status: "VISIBLE" },
      _count: { _all: true },
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

  const current = clampPage(page, summary.count, REVIEW_PAGE_SIZE);
  const { skip, take } = skipTake(current, REVIEW_PAGE_SIZE);

  const rows = await db.review.findMany({
    where: { courseId, status: "VISIBLE" },
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      rating: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true } },
      response: { select: { body: true, createdAt: true, responder: { select: { name: true } } } },
    },
  });

  return {
    summary,
    reviews: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      authorName: row.user.name,
      response: row.response
        ? { body: row.response.body, createdAt: row.response.createdAt, responderName: row.response.responder.name }
        : null,
    })),
    ownReview: own,
    page: current,
    pageCount: pageCount(summary.count, REVIEW_PAGE_SIZE),
  };
}

// ---------------------------------------------------------------------------
// Instructor replies (review_responses: one per review)
// ---------------------------------------------------------------------------

type ReplyResult = { ok: true } | { ok: false; message: string };

/** The review, found through the course's instructor, so nobody else can reply. */
function ownedReview(instructorId: string, reviewId: string) {
  return db.review.findFirst({
    where: { id: reviewId, course: { instructorId } },
    select: { id: true, userId: true, course: { select: { title: true, slug: true } }, response: { select: { id: true } } },
  });
}

/**
 * The course's instructor replies to a review, or edits their reply. The
 * reviewer is notified of the first reply (not of edits).
 */
export async function saveReviewResponse(instructorId: string, reviewId: string, rawBody: string): Promise<ReplyResult> {
  const body = rawBody.trim();
  if (!body) return { ok: false, message: "Write a reply first." };
  if (body.length > REVIEW_REPLY_MAX) return { ok: false, message: `Replies can be up to ${REVIEW_REPLY_MAX} characters.` };
  const review = await ownedReview(instructorId, reviewId);
  if (!review) return { ok: false, message: "Review not found." };

  await db.reviewResponse.upsert({
    where: { reviewId: review.id },
    create: { reviewId: review.id, responderId: instructorId, body },
    update: { body },
  });
  if (!review.response) {
    await notify(review.userId, "review_reply", {
      title: "The instructor replied to your review",
      body: review.course.title,
      href: `/courses/${review.course.slug}#reviews`,
    });
  }
  return { ok: true };
}

export async function deleteReviewResponse(instructorId: string, reviewId: string): Promise<ReplyResult> {
  const review = await ownedReview(instructorId, reviewId);
  if (!review) return { ok: false, message: "Review not found." };
  await db.reviewResponse.deleteMany({ where: { reviewId: review.id } });
  return { ok: true };
}

export type InstructorReview = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  authorName: string;
  course: { title: string; slug: string };
  response: { body: string; createdAt: Date } | null;
};

export const INSTRUCTOR_REVIEW_PAGE_SIZE = 20;

/** Visible reviews of an instructor's courses, newest first; optionally only those without a reply. */
export async function listInstructorReviews(
  instructorId: string,
  options: { unansweredOnly?: boolean; page?: string | number } = {},
): Promise<Paged<InstructorReview> & { unanswered: number }> {
  const base = { status: "VISIBLE" as const, course: { instructorId } };
  const where = options.unansweredOnly ? { ...base, response: { is: null } } : base;
  const [total, unanswered] = await Promise.all([
    db.review.count({ where }),
    db.review.count({ where: { ...base, response: { is: null } } }),
  ]);
  const current = clampPage(options.page, total, INSTRUCTOR_REVIEW_PAGE_SIZE);
  const { skip, take } = skipTake(current, INSTRUCTOR_REVIEW_PAGE_SIZE);
  const rows = await db.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      rating: true,
      body: true,
      createdAt: true,
      user: { select: { name: true } },
      course: { select: { title: true, slug: true } },
      response: { select: { body: true, createdAt: true } },
    },
  });
  return {
    items: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      createdAt: row.createdAt,
      authorName: row.user.name,
      course: row.course,
      response: row.response,
    })),
    total,
    page: current,
    pageCount: pageCount(total, INSTRUCTOR_REVIEW_PAGE_SIZE),
    unanswered,
  };
}

export type HomeTestimonial = {
  id: string;
  rating: number;
  body: string;
  authorName: string;
  courseTitle: string;
};

/** Recent visible reviews with a body, for the marketing home only. */
export async function listHomeTestimonials(take = 3, minRating = 1): Promise<HomeTestimonial[]> {
  const rows = await db.review.findMany({
    where: {
      status: "VISIBLE",
      body: { not: null },
      rating: { gte: minRating },
      course: { status: "PUBLISHED" },
    },
    orderBy: { createdAt: "desc" },
    take: take * 4,
    select: {
      id: true,
      rating: true,
      body: true,
      user: { select: { name: true } },
      course: { select: { title: true } },
    },
  });

  const out: HomeTestimonial[] = [];
  for (const row of rows) {
    const body = row.body?.trim();
    if (!body) continue;
    out.push({
      id: row.id,
      rating: row.rating,
      body,
      authorName: row.user.name,
      courseTitle: row.course.title,
    });
    if (out.length >= take) break;
  }
  return out;
}
