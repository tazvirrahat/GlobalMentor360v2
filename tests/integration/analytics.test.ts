import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { countEventsSince, forgetUserEvents, recordEvent } from "@/lib/analytics";
import { grantEnrollment } from "@/lib/enrollment";

/**
 * The event stream.
 *
 * Two properties matter more than the happy path. Recording must never take down
 * the thing it measures — a failed analytics insert losing a learner's
 * enrollment would be a strictly worse outcome than losing the event. And a
 * person must be identified only by userId, so erasure is one delete rather than
 * a scan of every payload.
 */

const run = randomUUID().slice(0, 8);
let userId: string;
let instructorId: string;
let courseId: string;

beforeAll(async () => {
  userId = (
    await db.user.create({
      data: { name: `Analytics Learner ${run}`, email: `analytics-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  instructorId = (
    await db.user.create({
      data: { name: `Analytics Instructor ${run}`, email: `analytics-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  courseId = (
    await db.course.create({
      data: {
        title: `Analytics Course ${run}`,
        slug: `analytics-course-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await db.analyticsEvent.deleteMany({
    where: {
      OR: [
        { userId: { in: [userId, instructorId] } },
        // Anonymous `course_viewed` is only written by this file. No FK, so
        // these would otherwise accumulate as `userId IS NULL` leftovers.
        { userId: null, name: "course_viewed" },
      ],
    },
  });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [userId, instructorId] } } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.analyticsEvent.deleteMany({ where: { userId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.update({ where: { id: courseId }, data: { enrollmentCount: 0 } });
});

describe("recordEvent", () => {
  it("stores the event with its payload", async () => {
    await recordEvent("course_viewed", userId, { courseId, position: 3 });

    const row = await db.analyticsEvent.findFirstOrThrow({
      where: { userId, name: "course_viewed" },
    });
    expect(row.payload).toMatchObject({ courseId, position: 3 });
  });

  it("never throws, so a broken write cannot fail the thing being measured", async () => {
    // A payload the column cannot hold. The contract is that this resolves and
    // logs, not that it propagates — an enrollment must not be lost to it.
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(
      recordEvent("course_viewed", userId, circular as never),
    ).resolves.toBeUndefined();
  });

  it("accepts a null user, for events before anyone signs in", async () => {
    await recordEvent("course_viewed", null, { courseId });
    const row = await db.analyticsEvent.findFirst({
      where: { userId: null, name: "course_viewed" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).not.toBeNull();
  });
});

describe("wired events", () => {
  it("records a grant once, from the path every rail converges on", async () => {
    await grantEnrollment(userId, courseId, "PURCHASE");

    const granted = await db.analyticsEvent.count({
      where: { userId, name: "enrollment_granted" },
    });
    expect(granted).toBe(1);
  });

  it("does not record a second event when a retried grant changes nothing", async () => {
    await grantEnrollment(userId, courseId, "PURCHASE");
    await grantEnrollment(userId, courseId, "PURCHASE");
    await grantEnrollment(userId, courseId, "PURCHASE");

    // The counter counts transitions, and so does the event. A retried webhook
    // must not look like three enrollments in the funnel.
    expect(
      await db.analyticsEvent.count({ where: { userId, name: "enrollment_granted" } }),
    ).toBe(1);
  });
});

describe("countEventsSince", () => {
  it("aggregates by name within the window", async () => {
    await recordEvent("course_viewed", userId, { courseId });
    await recordEvent("course_viewed", userId, { courseId });
    await recordEvent("checkout_started", userId, { courseId });

    const counts = await countEventsSince(new Date(Date.now() - 60_000));
    const byName = Object.fromEntries(counts.map((row) => [row.name, row.count]));

    expect(byName.course_viewed).toBeGreaterThanOrEqual(2);
    expect(byName.checkout_started).toBeGreaterThanOrEqual(1);
  });
});

describe("forgetUserEvents", () => {
  it("erases one person's history by userId alone", async () => {
    await recordEvent("course_viewed", userId, { courseId });
    await recordEvent("checkout_started", userId, { courseId });

    const deleted = await forgetUserEvents(userId);
    expect(deleted).toBeGreaterThanOrEqual(2);
    expect(await db.analyticsEvent.count({ where: { userId } })).toBe(0);
  });
});
