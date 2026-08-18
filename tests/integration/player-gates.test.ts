import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import {
  canAccessItemMedia,
  continueTargetId,
  getPlayerCourse,
  markLectureComplete,
  sequentialItemFromPlayer,
  submitQuizAttempt,
  updateWatchPosition,
} from "@/lib/progress";

/**
 * Sequential unlock has to hold on writes, not only on the sidebar. Completing a
 * locked lecture (or passing its quiz, or banking watch time) would inflate
 * percent and skip the gate the player is supposed to enforce.
 */

const run = randomUUID().slice(0, 8);
let instructorId: string;
let learnerId: string;
let courseId: string;
let slug: string;
let previewId: string;
let lectureId: string;
let quizItemId: string;
let assessmentId: string;
let questionId: string;
let correctOptionId: string;

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: { name: `Gate Instructor ${run}`, email: `gate-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  learnerId = (
    await db.user.create({
      data: { name: `Gate Learner ${run}`, email: `gate-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;

  slug = `gate-course-${run}`;
  const course = await db.course.create({
    data: {
      title: `Gate Course ${run}`,
      slug,
      status: "PUBLISHED",
      instructorId,
      publishedAt: new Date(),
      sections: {
        create: {
          title: "Sequence",
          position: 0,
          items: {
            create: [
              {
                type: "LECTURE",
                title: "Preview",
                position: 0,
                isPreview: true,
                lecture: {
                  create: { contentType: "ARTICLE", articleBody: "Intro", durationSeconds: 60 },
                },
              },
              {
                type: "LECTURE",
                title: "Required",
                position: 1,
                lecture: {
                  create: { contentType: "ARTICLE", articleBody: "Body", durationSeconds: 120 },
                },
              },
              {
                type: "QUIZ",
                title: "Check",
                position: 2,
                assessment: {
                  create: {
                    type: "QUIZ",
                    passThresholdPct: 70,
                    questions: {
                      create: {
                        prompt: "Ready?",
                        type: "SINGLE_CHOICE",
                        position: 0,
                        options: {
                          create: [
                            { text: "Yes", isCorrect: true, position: 0 },
                            { text: "No", isCorrect: false, position: 1 },
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

  courseId = course.id;
  const items = course.sections[0]!.items;
  previewId = items[0]!.id;
  lectureId = items[1]!.id;
  const quiz = items[2]!;
  quizItemId = quiz.id;
  assessmentId = quiz.assessment!.id;
  questionId = quiz.assessment!.questions[0]!.id;
  correctOptionId = quiz.assessment!.questions[0]!.options.find((option) => option.isCorrect)!.id;

  await grantEnrollment(learnerId, courseId, "GRANT");
});

afterAll(async () => {
  await db.quizAttempt.deleteMany({ where: { userId: learnerId } });
  await db.itemProgress.deleteMany({ where: { userId: learnerId } });
  await db.courseProgress.deleteMany({ where: { userId: learnerId } });
  await db.certificate.deleteMany({ where: { userId: learnerId } });
  await db.analyticsEvent.deleteMany({ where: { userId: learnerId } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.enrollment.deleteMany({ where: { userId: learnerId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [learnerId, instructorId] } } });
  await db.$disconnect();
});

describe("canAccessItemMedia", () => {
  it("allows a preview to anyone and keeps later required items locked", async () => {
    expect(await canAccessItemMedia(null, previewId)).toBe(true);
    expect(await canAccessItemMedia(null, lectureId)).toBe(false);
    expect(await canAccessItemMedia(learnerId, lectureId)).toBe(false);
    expect(await canAccessItemMedia(learnerId, quizItemId)).toBe(false);
    expect(await canAccessItemMedia(learnerId, previewId)).toBe(true);
  });
});

describe("player payload split", () => {
  it("loads articleBody and quiz options only for the current item", async () => {
    const outline = await getPlayerCourse(slug, learnerId);
    const outlinePreview = outline?.sections[0]?.items.find((item) => item.id === previewId);
    const outlineLecture = outline?.sections[0]?.items.find((item) => item.id === lectureId);
    const outlineQuiz = outline?.sections[0]?.items.find((item) => item.id === quizItemId);

    expect(outlinePreview?.lecture?.articleBody).toBeNull();
    expect(outlineLecture?.lecture?.articleBody).toBeNull();
    expect(outlineQuiz?.assessment?.questions).toEqual([]);

    const focusedLecture = await getPlayerCourse(slug, learnerId, lectureId);
    expect(focusedLecture?.sections[0]?.items.find((item) => item.id === lectureId)?.lecture?.articleBody).toBe(
      "Body",
    );
    expect(focusedLecture?.sections[0]?.items.find((item) => item.id === previewId)?.lecture?.articleBody).toBeNull();
    expect(focusedLecture?.sections[0]?.items.find((item) => item.id === quizItemId)?.assessment?.questions).toEqual(
      [],
    );

    const focusedQuiz = await getPlayerCourse(slug, learnerId, quizItemId);
    const quiz = focusedQuiz?.sections[0]?.items.find((item) => item.id === quizItemId);
    expect(quiz?.assessment?.questions.map((question) => question.prompt)).toEqual(["Ready?"]);
    expect(quiz?.assessment?.questions[0]?.options.map((option) => option.text)).toEqual(["Yes", "No"]);
    expect(JSON.stringify(focusedQuiz)).not.toMatch(/"isCorrect"/);
    expect(focusedQuiz?.sections[0]?.items.find((item) => item.id === lectureId)?.lecture?.articleBody).toBeNull();
  });
});

describe("sequential writes", () => {
  it("refuses complete, watch, and quiz writes on still-locked items", async () => {
    const completeLocked = await markLectureComplete(learnerId, lectureId);
    expect(completeLocked.ok).toBe(false);

    const watchLocked = await updateWatchPosition(learnerId, lectureId, 90);
    expect(watchLocked.ok).toBe(false);

    const quizLocked = await submitQuizAttempt(learnerId, assessmentId, [
      { questionId, selectedOptionIds: [correctOptionId] },
    ]);
    expect(quizLocked.ok).toBe(false);

    const player = await getPlayerCourse(slug, learnerId);
    expect(player?.percent).toBe(0);
    expect(player?.sections[0]?.items.find((item) => item.id === lectureId)?.locked).toBe(true);
  });

  it("continue-target after completing the preview is the lesson that unlocks", async () => {
    const before = await getPlayerCourse(slug, learnerId);
    const items = before!.sections.flatMap((section) => section.items).map(sequentialItemFromPlayer);
    expect(continueTargetId(items, previewId)).toBe(lectureId);

    const completed = await markLectureComplete(learnerId, previewId);
    expect(completed.ok).toBe(true);

    const after = await getPlayerCourse(slug, learnerId);
    expect(after?.percent).toBe(33.3);
    expect(after?.sections[0]?.items.find((item) => item.id === lectureId)?.locked).toBe(false);
    expect(await canAccessItemMedia(learnerId, lectureId)).toBe(true);
    expect(await canAccessItemMedia(learnerId, quizItemId)).toBe(false);

    const lectureDone = await markLectureComplete(learnerId, lectureId);
    expect(lectureDone.ok).toBe(true);
    expect(await canAccessItemMedia(learnerId, quizItemId)).toBe(true);

    const passed = await submitQuizAttempt(learnerId, assessmentId, [
      { questionId, selectedOptionIds: [correctOptionId] },
    ]);
    expect(passed.ok).toBe(true);
    if (passed.ok) expect(passed.passed).toBe(true);
    expect((await getPlayerCourse(slug, learnerId))?.percent).toBe(100);
  });
});

describe("unpublished course media gate", () => {
  let draftCourseId: string;
  let draftPreviewId: string;
  let draftLectureId: string;

  beforeAll(async () => {
    const draft = await db.course.create({
      data: {
        title: `Draft Gate ${run}`,
        slug: `draft-gate-${run}`,
        status: "DRAFT",
        instructorId,
        sections: {
          create: {
            title: "Hidden",
            position: 0,
            items: {
              create: [
                {
                  type: "LECTURE",
                  title: "Draft preview",
                  position: 0,
                  isPreview: true,
                  lecture: {
                    create: { contentType: "ARTICLE", articleBody: "Secret", durationSeconds: 30 },
                  },
                },
                {
                  type: "LECTURE",
                  title: "Draft required",
                  position: 1,
                  lecture: {
                    create: { contentType: "ARTICLE", articleBody: "Later", durationSeconds: 30 },
                  },
                },
              ],
            },
          },
        },
      },
      select: {
        id: true,
        sections: { select: { items: { orderBy: { position: "asc" }, select: { id: true } } } },
      },
    });
    draftCourseId = draft.id;
    draftPreviewId = draft.sections[0]!.items[0]!.id;
    draftLectureId = draft.sections[0]!.items[1]!.id;
    await grantEnrollment(learnerId, draftCourseId, "GRANT");
  });

  afterAll(async () => {
    await db.itemProgress.deleteMany({
      where: { userId: learnerId, curriculumItem: { section: { courseId: draftCourseId } } },
    });
    await db.courseProgress.deleteMany({ where: { userId: learnerId, courseId: draftCourseId } });
    await db.enrollment.deleteMany({ where: { courseId: draftCourseId } });
    await db.course.deleteMany({ where: { id: draftCourseId } });
  });

  it("hides unpublished items from tourists, including previews, and keeps sequential unlock for enrolled learners", async () => {
    expect(await canAccessItemMedia(null, draftPreviewId)).toBe(false);
    expect(await canAccessItemMedia(null, draftLectureId)).toBe(false);
    expect(await canAccessItemMedia(learnerId, draftPreviewId)).toBe(true);
    expect(await canAccessItemMedia(learnerId, draftLectureId)).toBe(false);

    const completed = await markLectureComplete(learnerId, draftPreviewId);
    expect(completed.ok).toBe(true);
    expect(await canAccessItemMedia(learnerId, draftLectureId)).toBe(true);
  });
});
