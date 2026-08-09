import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The authoring path, driven through the real server actions.
 *
 * The quiz builder shipped once with no way to reach it: `addItem` defaulted to
 * LECTURE, no control posted a `type`, and nothing linked to the editor route.
 * Typecheck, lint and build all passed, because none of them can tell whether a
 * feature is reachable. These tests cover the half that is testable — that the
 * action creates the right shape — and the UI half stays a manual check.
 *
 * The player's grader is the real acceptance criterion here: a quiz the studio
 * can produce but lib/progress.ts cannot grade is worse than no quiz builder.
 */

const hoisted = vi.hoisted(() => ({ instructorId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({
    id: hoisted.instructorId,
    email: "authoring-instructor@example.test",
    name: "Authoring Instructor",
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { addItem } = await import("@/app/studio/curriculum-actions");
const { saveQuestion } = await import("@/app/studio/assessment-actions");
const { db } = await import("@/lib/db");
const { submitQuizAttempt } = await import("@/lib/progress");
const { grantEnrollment } = await import("@/lib/enrollment");

const run = randomUUID().slice(0, 8);
let courseId: string;
let sectionId: string;
let learnerId: string;

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [key, value] of Object.entries(entries)) f.set(key, value);
  return f;
}

/**
 * The three option arrays are positional, exactly as the builder posts them:
 * row i is optionText[i], its id is optionId[i], and it is correct when i
 * appears under `correct`.
 */
function questionForm(fields: Record<string, string>, options: { text: string; correct: boolean }[]) {
  const f = form(fields);
  options.forEach((option, index) => {
    f.append("optionId", "");
    f.append("optionText", option.text);
    if (option.correct) f.append("correct", String(index));
  });
  return f;
}

beforeAll(async () => {
  hoisted.instructorId = (
    await db.user.create({
      data: { name: `Authoring Instructor ${run}`, email: `authoring-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  learnerId = (
    await db.user.create({
      data: { name: `Authoring Learner ${run}`, email: `authoring-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  courseId = (
    await db.course.create({
      data: {
        title: `Authoring Course ${run}`,
        slug: `authoring-course-${run}`,
        status: "PUBLISHED",
        instructorId: hoisted.instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;
  sectionId = (
    await db.section.create({
      data: { courseId, title: "Section 1", position: 0 },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [hoisted.instructorId, learnerId] } } });
  await db.$disconnect();
});

describe("addItem", () => {
  it("creates a QUIZ item with its assessment atomically", async () => {
    // This is what the "Add quiz" submit button posts.
    const result = await addItem({ status: "idle" }, form({ sectionId, title: `Quiz ${run}`, type: "QUIZ" }));
    expect(result.status).toBe("done");

    const item = await db.curriculumItem.findFirstOrThrow({
      where: { sectionId, title: `Quiz ${run}` },
      select: { type: true, assessment: { select: { id: true, passThresholdPct: true } } },
    });

    expect(item.type).toBe("QUIZ");
    // A QUIZ row without its 1:1 Assessment renders a broken player page.
    expect(item.assessment).not.toBeNull();
    expect(item.assessment?.passThresholdPct).toBe(70);
  });

  it("still defaults to a lecture when no type is posted", async () => {
    await addItem({ status: "idle" }, form({ sectionId, title: `Lecture ${run}` }));
    const item = await db.curriculumItem.findFirstOrThrow({
      where: { sectionId, title: `Lecture ${run}` },
      select: { type: true, lecture: { select: { contentType: true } } },
    });
    expect(item.type).toBe("LECTURE");
    expect(item.lecture?.contentType).toBe("ARTICLE");
  });
});

describe("saveQuestion", () => {
  let itemId: string;
  let assessmentId: string;

  beforeAll(async () => {
    await addItem({ status: "idle" }, form({ sectionId, title: `Graded ${run}`, type: "QUIZ" }));
    const item = await db.curriculumItem.findFirstOrThrow({
      where: { sectionId, title: `Graded ${run}` },
      select: { id: true, assessment: { select: { id: true } } },
    });
    itemId = item.id;
    assessmentId = item.assessment!.id;
  });

  it("refuses a question with no correct option", async () => {
    const result = await saveQuestion(
      { status: "idle" },
      questionForm({ itemId, prompt: "Unanswerable?", type: "SINGLE_CHOICE" }, [
        { text: "a", correct: false },
        { text: "b", correct: false },
      ]),
    );

    expect(result.status).toBe("error");
    expect(await db.question.count({ where: { assessmentId } })).toBe(0);
  });

  it("produces a question the player's grader marks correctly", async () => {
    const saved = await saveQuestion(
      { status: "idle" },
      questionForm({ itemId, prompt: "Two plus two?", type: "SINGLE_CHOICE" }, [
        { text: "4", correct: true },
        { text: "5", correct: false },
      ]),
    );
    expect(saved.status).toBe("done");

    const question = await db.question.findFirstOrThrow({
      where: { assessmentId },
      select: { id: true, options: { select: { id: true, isCorrect: true } } },
    });

    await grantEnrollment(learnerId, courseId, "GRANT");

    const right = await submitQuizAttempt(learnerId, assessmentId, [
      {
        questionId: question.id,
        selectedOptionIds: question.options.filter((o) => o.isCorrect).map((o) => o.id),
      },
    ]);
    expect(right.ok && right.passed).toBe(true);
    expect(right.ok && right.scorePct).toBe(100);

    const wrong = await submitQuizAttempt(learnerId, assessmentId, [
      {
        questionId: question.id,
        selectedOptionIds: question.options.filter((o) => !o.isCorrect).map((o) => o.id),
      },
    ]);
    expect(wrong.ok && wrong.passed).toBe(false);
  });
});
