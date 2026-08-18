import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { grantEnrollment, revokeEnrollment } from "@/lib/enrollment";
import { canPlayItem, isEnrolled } from "@/lib/entitlement";
import {
  getPlayerCourse,
  markLectureComplete,
  recomputeCourseProgress,
  submitQuizAttempt,
} from "@/lib/progress";

const run = randomUUID().slice(0, 8);
let instructorId: string;
let learnerId: string;
let mixedCourseId: string;
let mixedSlug: string;
let lectureId: string;
let quizItemId: string;
let assessmentId: string;
let correctOptionId: string;
let wrongOptionId: string;
let questionId: string;
let emptyCourseId: string;
let emptySlug: string;

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: { name: `Prog Instructor ${run}`, email: `prog-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  learnerId = (
    await db.user.create({
      data: { name: `Prog Learner ${run}`, email: `prog-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;

  mixedSlug = `prog-mixed-${run}`;
  const mixed = await db.course.create({
    data: {
      title: `Prog Mixed ${run}`,
      slug: mixedSlug,
      status: "PUBLISHED",
      instructorId,
      publishedAt: new Date(),
      sections: {
        create: {
          title: "Section",
          position: 0,
          items: {
            create: [
              {
                type: "LECTURE",
                title: "Read this",
                position: 0,
                isPreview: true,
                lecture: {
                  create: { contentType: "ARTICLE", articleBody: "Hello", durationSeconds: 60 },
                },
              },
              {
                type: "QUIZ",
                title: "Prove it",
                position: 1,
                assessment: {
                  create: {
                    type: "QUIZ",
                    passThresholdPct: 70,
                    questions: {
                      create: {
                        prompt: "2 + 2?",
                        type: "SINGLE_CHOICE",
                        position: 0,
                        options: {
                          create: [
                            { text: "4", isCorrect: true, position: 0 },
                            { text: "5", isCorrect: false, position: 1 },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      sections: {
        select: {
          items: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              type: true,
              assessment: {
                select: {
                  id: true,
                  questions: { select: { id: true, options: { select: { id: true, isCorrect: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  mixedCourseId = mixed.id;
  const items = mixed.sections[0]!.items;
  lectureId = items.find((item) => item.type === "LECTURE")!.id;
  const quiz = items.find((item) => item.type === "QUIZ")!;
  quizItemId = quiz.id;
  assessmentId = quiz.assessment!.id;
  questionId = quiz.assessment!.questions[0]!.id;
  correctOptionId = quiz.assessment!.questions[0]!.options.find((o) => o.isCorrect)!.id;
  wrongOptionId = quiz.assessment!.questions[0]!.options.find((o) => !o.isCorrect)!.id;

  emptySlug = `prog-empty-${run}`;
  emptyCourseId = (
    await db.course.create({
      data: {
        title: `Prog Empty ${run}`,
        slug: emptySlug,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;

  await grantEnrollment(learnerId, mixedCourseId, "GRANT");
  await grantEnrollment(learnerId, emptyCourseId, "GRANT");
});

afterAll(async () => {
  await db.quizAttempt.deleteMany({ where: { userId: learnerId } });
  await db.itemProgress.deleteMany({ where: { userId: learnerId } });
  await db.courseProgress.deleteMany({ where: { userId: learnerId } });
  await db.certificate.deleteMany({ where: { userId: learnerId } });
  await db.analyticsEvent.deleteMany({ where: { userId: learnerId } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.enrollment.deleteMany({ where: { userId: learnerId } });
  await db.course.deleteMany({ where: { id: { in: [mixedCourseId, emptyCourseId] } } });
  await db.user.deleteMany({ where: { id: { in: [learnerId, instructorId] } } });
  await db.$disconnect();
});

describe("recomputeCourseProgress — mixed types", () => {
  it("locks the quiz until the preceding lecture is complete", async () => {
    const player = await getPlayerCourse(mixedSlug, learnerId);
    const quiz = player?.sections[0]?.items.find((item) => item.id === quizItemId);
    expect(quiz?.locked).toBe(true);
  });

  it("stays below 100% when the lecture is done but the quiz is not passed", async () => {
    await markLectureComplete(learnerId, lectureId);
    const rollup = await recomputeCourseProgress(learnerId, mixedCourseId);
    expect(rollup.percent).toBe(50);
    expect(rollup.completedAt).toBeNull();

    const player = await getPlayerCourse(mixedSlug, learnerId);
    expect(player?.percent).toBe(50);
    const quiz = player?.sections[0]?.items.find((item) => item.id === quizItemId);
    expect(quiz?.completed).toBe(false);
    expect(quiz?.locked).toBe(false);
  });

  it("does not complete the quiz on a failing attempt", async () => {
    const result = await submitQuizAttempt(learnerId, assessmentId, [
      { questionId, selectedOptionIds: [wrongOptionId] },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.passed).toBe(false);

    const rollup = await recomputeCourseProgress(learnerId, mixedCourseId);
    expect(rollup.percent).toBe(50);
  });

  it("reaches 100% only after a passing quiz attempt", async () => {
    const result = await submitQuizAttempt(learnerId, assessmentId, [
      { questionId, selectedOptionIds: [correctOptionId] },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.passed).toBe(true);

    const rollup = await recomputeCourseProgress(learnerId, mixedCourseId);
    expect(rollup.percent).toBe(100);
    expect(rollup.completedAt).not.toBeNull();

    const player = await getPlayerCourse(mixedSlug, learnerId);
    expect(player?.percent).toBe(100);
    expect(player?.certificateSerial).not.toBeNull();
  });
});

describe("empty curriculum", () => {
  it("computes 0% for a course with no items", async () => {
    const rollup = await recomputeCourseProgress(learnerId, emptyCourseId);
    expect(rollup.percent).toBe(0);
    expect(rollup.completedAt).toBeNull();

    const player = await getPlayerCourse(emptySlug, learnerId);
    expect(player?.percent).toBe(0);
    expect(player?.orderedItemIds).toEqual([]);
  });
});

describe("grantEnrollment idempotency", () => {
  it("does not create a second row or bump the count on a retried grant", async () => {
    const before = await db.course.findUniqueOrThrow({
      where: { id: mixedCourseId },
      select: { enrollmentCount: true },
    });

    await grantEnrollment(learnerId, mixedCourseId, "GRANT");
    await grantEnrollment(learnerId, mixedCourseId, "PURCHASE");

    expect(await db.enrollment.count({ where: { userId: learnerId, courseId: mixedCourseId } })).toBe(
      1,
    );
    const after = await db.course.findUniqueOrThrow({
      where: { id: mixedCourseId },
      select: { enrollmentCount: true },
    });
    expect(after.enrollmentCount).toBe(before.enrollmentCount);
  });
});

describe("revokeEnrollment effects", () => {
  it("removes access while leaving progress history in place", async () => {
    expect(await isEnrolled(learnerId, mixedCourseId)).toBe(true);

    await revokeEnrollment(learnerId, mixedCourseId);
    expect(await isEnrolled(learnerId, mixedCourseId)).toBe(false);

    const progress = await db.itemProgress.count({ where: { userId: learnerId } });
    expect(progress).toBeGreaterThan(0);

    const quizAccess = await canPlayItem(learnerId, quizItemId);
    expect(quizAccess).toEqual({ allowed: false, reason: "not-enrolled" });

    // Preview lectures stay playable — entitlement, not progress, is what revoked.
    const preview = await canPlayItem(learnerId, lectureId);
    expect(preview).toEqual({ allowed: true, reason: "preview" });

    const player = await getPlayerCourse(mixedSlug, learnerId);
    expect(player?.enrolled).toBe(false);
  });
});
