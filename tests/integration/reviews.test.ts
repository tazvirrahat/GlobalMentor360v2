import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The review write path against a real Postgres.
 *
 * lib/reviews.test.ts covers `summariseRatings`, which is arithmetic and needs no
 * database. What it cannot reach is the reason `recomputeCourseRating` takes
 * `SELECT ... FOR UPDATE` before it aggregates: that decision is about what two
 * transactions see of each other under READ COMMITTED, and a fake client has no
 * isolation level to be wrong about. This repo has shipped the check-then-act
 * counter bug twice, so the lock is the part most worth pinning down.
 *
 * Everything here is the real thing — real transactions, real constraints, real
 * `canReview`. Nothing is mocked, because there is no request scope to fake:
 * `saveReview` is a plain service function and the server action that wraps it is
 * the only part that touches Next.
 */

const { db } = await import("@/lib/db");
const { saveReview, recomputeCourseRating } = await import("@/lib/reviews");
const { grantEnrollment, revokeEnrollment } = await import("@/lib/enrollment");

const run = randomUUID().slice(0, 8);
const courseIds: string[] = [];
let instructorId: string;
let learnerAId: string;
let learnerBId: string;

/**
 * A course per test. The subject is a pair of denormalised columns on one row,
 * so tests sharing a course would be reading each other's writes and the first
 * failure would cascade into every later assertion.
 */
async function newCourse(label: string): Promise<string> {
  const course = await db.course.create({
    data: {
      title: `Review ${label} ${run}`,
      slug: `review-${label}-${run}`,
      status: "PUBLISHED",
      instructorId,
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  courseIds.push(course.id);
  return course.id;
}

/** The two columns every catalog card renders, straight from the row. */
async function aggregates(courseId: string) {
  return db.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { ratingAverage: true, ratingCount: true },
  });
}

/** A one-shot barrier, so two transactions can be held open across each other. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

const newUser = async (role: string) =>
  (
    await db.user.create({
      data: { name: `Review ${role} ${run}`, email: `review-${role}-${run}@example.test` },
      select: { id: true },
    })
  ).id;

beforeAll(async () => {
  [instructorId, learnerAId, learnerBId] = await Promise.all([
    newUser("instructor"),
    newUser("learner-a"),
    newUser("learner-b"),
  ]);
});

afterAll(async () => {
  await db.review.deleteMany({ where: { courseId: { in: courseIds } } });
  await db.analyticsEvent.deleteMany({
    where: { userId: { in: [instructorId, learnerAId, learnerBId] } },
  });
  await db.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.user.deleteMany({ where: { id: { in: [instructorId, learnerAId, learnerBId] } } });
  await db.$disconnect();
});

describe("saveReview", () => {
  it("writes the course aggregates the catalog reads", async () => {
    const courseId = await newCourse("create");
    await grantEnrollment(learnerAId, courseId, "GRANT");

    // Before the write, the columns are at their schema defaults — which is what
    // made every course read "No ratings yet" before this path existed.
    expect(await aggregates(courseId)).toEqual({ ratingAverage: 0, ratingCount: 0 });

    const result = await saveReview({
      userId: learnerAId,
      courseId,
      rating: 4,
      body: "Clear and well paced.",
    });

    expect(result.ok).toBe(true);
    expect(await aggregates(courseId)).toEqual({ ratingAverage: 4, ratingCount: 1 });
  });

  it("refuses a learner whose enrollment was revoked (invariant 4)", async () => {
    const courseId = await newCourse("revoked");
    await grantEnrollment(learnerAId, courseId, "PURCHASE");
    await saveReview({ userId: learnerAId, courseId, rating: 5, body: null });
    await revokeEnrollment(learnerAId, courseId);

    // A refunded learner keeps the review they already wrote — but cannot post
    // through the action again, whatever the page rendered for them earlier.
    const result = await saveReview({ userId: learnerAId, courseId, rating: 1, body: null });

    expect(result.ok).toBe(false);
    expect(await aggregates(courseId)).toEqual({ ratingAverage: 5, ratingCount: 1 });
    expect(await db.review.findFirstOrThrow({ where: { courseId } })).toMatchObject({ rating: 5 });
  });

  it("moves the average on an edit instead of counting the review twice", async () => {
    const courseId = await newCourse("edit");
    await Promise.all([
      grantEnrollment(learnerAId, courseId, "GRANT"),
      grantEnrollment(learnerBId, courseId, "GRANT"),
    ]);

    await saveReview({ userId: learnerAId, courseId, rating: 5, body: null });
    await saveReview({ userId: learnerBId, courseId, rating: 1, body: null });
    expect(await aggregates(courseId)).toEqual({ ratingAverage: 3, ratingCount: 2 });

    // The same learner posting again is an edit, not a second review. An
    // incrementing counter would have to know the 5 it is replacing; recomputing
    // has no previous value to be wrong about.
    const edited = await saveReview({
      userId: learnerAId,
      courseId,
      rating: 2,
      body: "Changed my mind.",
    });

    expect(edited.ok).toBe(true);
    expect(await aggregates(courseId)).toEqual({ ratingAverage: 1.5, ratingCount: 2 });
    expect(await db.review.count({ where: { courseId } })).toBe(2);
  });

  it("counts both of two writers racing through the whole action", async () => {
    const courseId = await newCourse("race");
    await Promise.all([
      grantEnrollment(learnerAId, courseId, "GRANT"),
      grantEnrollment(learnerBId, courseId, "GRANT"),
    ]);

    // Two independent connections, started in the same tick. This is the shape
    // production produces — two learners submitting the form at once — and it is
    // deliberately not the deterministic version below, because a lock that only
    // holds under a hand-built interleaving is not worth having.
    const [a, b] = await Promise.all([
      saveReview({ userId: learnerAId, courseId, rating: 5, body: null }),
      saveReview({ userId: learnerBId, courseId, rating: 1, body: null }),
    ]);

    expect(a.ok && b.ok).toBe(true);
    expect(await db.review.count({ where: { courseId } })).toBe(2);
    expect(await aggregates(courseId)).toEqual({ ratingAverage: 3, ratingCount: 2 });
  });
});

describe("recomputeCourseRating", () => {
  it("serialises two recomputes that would otherwise miss each other's row", async () => {
    const courseId = await newCourse("interleave");

    // The interleaving spelled out rather than raced for. Both reviews are
    // inserted before either aggregate runs, so under READ COMMITTED each
    // transaction's GROUP BY would see its own uncommitted row and none of the
    // other's — both would compute a count of 1, and the last to commit would
    // store it. The FOR UPDATE on the course row is what forces the second
    // aggregate to run after the first transaction has committed.
    //
    // Enrollment is not granted here: this is the aggregate in isolation, and
    // invariant 4 is `saveReview`'s to enforce, not this function's.
    const bothInserted = gate();
    let insertedCount = 0;

    const writer = (userId: string, rating: number) =>
      db.$transaction(async (tx) => {
        await tx.review.create({ data: { userId, courseId, rating } });

        // Neither transaction may aggregate until both rows exist, or the race
        // this is about cannot occur and the test proves nothing.
        insertedCount += 1;
        if (insertedCount === 2) bothInserted.open();
        await bothInserted.opened;

        return recomputeCourseRating(courseId, tx);
      });

    await Promise.all([writer(learnerAId, 5), writer(learnerBId, 3)]);

    // 5 and 3 both counted: the second transaction aggregated after the first
    // committed, so it saw a row it had not written.
    expect(await aggregates(courseId)).toEqual({ ratingAverage: 4, ratingCount: 2 });
  });

  it("drops a hidden review the next time anything recomputes", async () => {
    const courseId = await newCourse("hidden");
    await Promise.all([
      grantEnrollment(learnerAId, courseId, "GRANT"),
      grantEnrollment(learnerBId, courseId, "GRANT"),
    ]);
    await saveReview({ userId: learnerAId, courseId, rating: 5, body: null });
    await saveReview({ userId: learnerBId, courseId, rating: 1, body: null });

    // A moderator hides one. Nothing in lib/reviews.ts runs on that write, which
    // is exactly why the landing page renders the live summary rather than these
    // columns — they stay wrong until the next review lands.
    await db.review.updateMany({ where: { courseId, userId: learnerBId }, data: { status: "HIDDEN" } });
    expect(await aggregates(courseId)).toEqual({ ratingAverage: 3, ratingCount: 2 });

    expect(await recomputeCourseRating(courseId)).toMatchObject({ average: 5, count: 1 });
    expect(await aggregates(courseId)).toEqual({ ratingAverage: 5, ratingCount: 1 });
  });
});
