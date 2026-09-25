import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Review before publishing: the state machine, who may move it, and the audit
 * trail. Nothing mocked — notifications are written inline without a request
 * scope, like every other integration test here.
 */

const { db } = await import("@/lib/db");
const { approveReview, listReviewQueue, returnReview, submitForReview, withdrawReview } = await import(
  "@/lib/course-review"
);

const run = randomUUID().slice(0, 8);
let instructorId: string;
let otherId: string;
let adminId: string;
let courseId: string;

beforeAll(async () => {
  const user = async (label: string) =>
    (await db.user.create({ data: { name: `Rev ${label} ${run}`, email: `rev-${label}-${run}@example.test` }, select: { id: true } }))
      .id;
  [instructorId, otherId, adminId] = await Promise.all([user("instructor"), user("other"), user("admin")]);
  await db.userRole.create({ data: { userId: adminId, role: "ADMIN" } });

  // Ready by every readiness check: title, subtitle, a section, a lecture, a price.
  courseId = (
    await db.course.create({
      data: {
        title: `Review Course ${run}`,
        slug: `review-course-${run}`,
        subtitle: "Ready to go",
        instructorId,
        prices: { create: { currency: "BDT", amount: 100000, isActive: true } },
        sections: {
          create: {
            title: "S",
            position: 0,
            items: {
              create: {
                title: "L",
                type: "LECTURE",
                position: 0,
                lecture: { create: { contentType: "ARTICLE", articleBody: "x" } },
              },
            },
          },
        },
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { targetId: courseId } });
  await db.notification.deleteMany({ where: { userId: { in: [instructorId, adminId] } } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [instructorId, otherId, adminId] } } });
  await db.$disconnect();
});

const status = async () =>
  db.course.findUniqueOrThrow({ where: { id: courseId }, select: { status: true, reviewNote: true, publishedAt: true } });

describe("course review", () => {
  it("only the owner can submit, and a submitted course joins the queue", async () => {
    expect((await submitForReview(otherId, courseId)).ok).toBe(false);
    expect(await submitForReview(instructorId, courseId)).toEqual({ ok: true });
    expect((await status()).status).toBe("IN_REVIEW");
    expect((await listReviewQueue()).map((row) => row.id)).toContain(courseId);
    expect((await submitForReview(instructorId, courseId)).ok).toBe(false);
  });

  it("returning needs a note, sends the course back to Draft and tells the instructor", async () => {
    expect((await returnReview(adminId, courseId, "   ")).ok).toBe(false);
    expect(await returnReview(adminId, courseId, "Add a second section on joins.")).toEqual({ ok: true });
    expect(await status()).toMatchObject({ status: "DRAFT", reviewNote: "Add a second section on joins." });
    const note = await db.notification.findFirst({ where: { userId: instructorId, type: "course_review" }, select: { payload: true } });
    expect(JSON.stringify(note?.payload)).toContain("Add a second section on joins.");
  });

  it("resubmitting clears the note; withdrawing goes back to Draft", async () => {
    await submitForReview(instructorId, courseId);
    expect(await status()).toMatchObject({ status: "IN_REVIEW", reviewNote: null });
    expect(await withdrawReview(instructorId, courseId)).toEqual({ ok: true });
    expect((await status()).status).toBe("DRAFT");
    expect((await approveReview(adminId, courseId)).ok).toBe(false);
  });

  it("approving publishes a still-ready course and refuses one that stopped being ready", async () => {
    await submitForReview(instructorId, courseId);
    await db.price.updateMany({ where: { courseId }, data: { isActive: false } });
    expect((await approveReview(adminId, courseId)).ok).toBe(false);
    await db.price.updateMany({ where: { courseId }, data: { isActive: true } });

    expect(await approveReview(adminId, courseId)).toEqual({ ok: true });
    const after = await status();
    expect(after.status).toBe("PUBLISHED");
    expect(after.publishedAt).not.toBeNull();
  });

  it("audits every step", async () => {
    const actions = (await db.auditLog.findMany({ where: { targetId: courseId }, orderBy: { createdAt: "asc" }, select: { action: true } })).map(
      (row) => row.action,
    );
    expect(actions).toEqual([
      "course.review.submit",
      "course.review.return",
      "course.review.submit",
      "course.review.withdraw",
      "course.review.submit",
      "course.review.approve",
    ]);
  });
});
