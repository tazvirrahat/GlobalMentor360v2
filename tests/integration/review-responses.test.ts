import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Only the course's instructor replies; the reviewer hears about the first reply; the course page shows it. */

const { db } = await import("@/lib/db");
const { deleteReviewResponse, getCourseReviewPanel, listInstructorReviews, saveReviewResponse } = await import("@/lib/reviews");

const run = randomUUID().slice(0, 8);
let ownerId: string;
let otherId: string;
let learnerId: string;
let courseId: string;
let reviewId: string;

beforeAll(async () => {
  const user = async (label: string) =>
    (await db.user.create({ data: { name: `Rr ${label} ${run}`, email: `rr-${label}-${run}@example.test` }, select: { id: true } })).id;
  [ownerId, otherId, learnerId] = await Promise.all([user("owner"), user("other"), user("learner")]);
  courseId = (
    await db.course.create({
      data: { title: `Rr ${run}`, slug: `rr-${run}`, status: "PUBLISHED", publishedAt: new Date(), instructorId: ownerId },
      select: { id: true },
    })
  ).id;
  reviewId = (await db.review.create({ data: { userId: learnerId, courseId, rating: 4, body: "Good pace." }, select: { id: true } })).id;
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.review.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId, learnerId] } } });
  await db.$disconnect();
});

describe("instructor replies", () => {
  it("lists the review as needing a reply", async () => {
    const list = await listInstructorReviews(ownerId, { unansweredOnly: true });
    expect(list.items.map((row) => row.id)).toContain(reviewId);
    expect(list.unanswered).toBe(1);
  });

  it("refuses another instructor and an empty reply", async () => {
    expect(await saveReviewResponse(otherId, reviewId, "Thanks!")).toEqual({ ok: false, message: "Review not found." });
    expect(await saveReviewResponse(ownerId, reviewId, "   ")).toEqual({ ok: false, message: "Write a reply first." });
  });

  it("saves the reply, notifies the reviewer once, and shows it on the course page", async () => {
    expect(await saveReviewResponse(ownerId, reviewId, "Thanks, glad it helped.")).toEqual({ ok: true });
    expect(await saveReviewResponse(ownerId, reviewId, "Thanks, glad the pace worked.")).toEqual({ ok: true });
    expect(await db.notification.count({ where: { userId: learnerId, type: "review_reply" } })).toBe(1);

    const panel = await getCourseReviewPanel(courseId, null);
    expect(panel.reviews[0]?.response).toMatchObject({ body: "Thanks, glad the pace worked.", responderName: `Rr owner ${run}` });
    expect((await listInstructorReviews(ownerId, { unansweredOnly: true })).unanswered).toBe(0);
  });

  it("lets only the owner delete it", async () => {
    expect((await deleteReviewResponse(otherId, reviewId)).ok).toBe(false);
    expect(await deleteReviewResponse(ownerId, reviewId)).toEqual({ ok: true });
    expect((await getCourseReviewPanel(courseId, null)).reviews[0]?.response).toBeNull();
  });
});
