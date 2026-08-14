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
 * The four option arrays are positional, exactly as the builder posts them:
 * row i is optionText[i], its per-answer note is optionExplanation[i], its id is
 * optionId[i] (empty for a new row), and it is correct when i appears under
 * `correct`.
 *
 * Every row appends to every array, blank included — that is the contract
 * readOptionDrafts checks, and skipping a blank note here would be the exact
 * desynchronisation it refuses.
 */
function questionForm(
  fields: Record<string, string>,
  options: { id?: string; text: string; correct: boolean; explanation?: string }[],
) {
  const f = form(fields);
  options.forEach((option, index) => {
    f.append("optionId", option.id ?? "");
    f.append("optionText", option.text);
    f.append("optionExplanation", option.explanation ?? "");
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

/**
 * AnswerOption.explanation, which docs/FEATURES.md section D lists as P0 and the
 * builder could not write: the column existed, the form had no input for it, and
 * writeQuestionOptions never set it.
 *
 * The pairing is what these assert, not merely that a note arrives. The option
 * inputs are positional arrays, so the failure mode that matters is a note landing
 * on the neighbouring answer — which saves cleanly, reads as the author's own
 * words, and would tell a learner the wrong thing with full confidence.
 */
describe("per-answer explanations", () => {
  let itemId: string;
  let assessmentId: string;

  beforeAll(async () => {
    await addItem({ status: "idle" }, form({ sectionId, title: `Explained ${run}`, type: "QUIZ" }));
    const item = await db.curriculumItem.findFirstOrThrow({
      where: { sectionId, title: `Explained ${run}` },
      select: { id: true, assessment: { select: { id: true } } },
    });
    itemId = item.id;
    assessmentId = item.assessment!.id;
  });

  /** Text and note together: a pairing check reads as nothing if the text is dropped. */
  async function pairsFor(prompt: string) {
    const question = await db.question.findFirstOrThrow({
      where: { assessmentId, prompt },
      select: {
        id: true,
        options: {
          orderBy: { position: "asc" },
          select: { id: true, text: true, explanation: true },
        },
      },
    });
    return {
      id: question.id,
      optionIds: question.options.map((option) => option.id),
      pairs: question.options.map((option) => [option.text, option.explanation]),
    };
  }

  it("writes one note per option, paired by position", async () => {
    const prompt = `Which one is erased at compile time? ${run}`;

    const saved = await saveQuestion(
      { status: "idle" },
      questionForm({ itemId, prompt, type: "SINGLE_CHOICE" }, [
        { text: "interface", correct: true, explanation: "Types are erased in the emit." },
        { text: "class", correct: false, explanation: "A class is a runtime value too." },
        // Blank on purpose: an empty note must stay null on *this* row rather than
        // pulling the next row's note up into it.
        { text: "const", correct: false },
      ]),
    );
    expect(saved.status).toBe("done");

    const { pairs } = await pairsFor(prompt);
    expect(pairs).toEqual([
      ["interface", "Types are erased in the emit."],
      ["class", "A class is a runtime value too."],
      ["const", null],
    ]);
  });

  it("rewrites and clears notes on a re-save of the same options", async () => {
    const prompt = `Which one is erased at compile time? ${run}`;
    const before = await pairsFor(prompt);

    // The edit path: the builder posts the ids it was given, so these are updates
    // of the same three rows rather than a delete-and-recreate.
    const saved = await saveQuestion(
      { status: "idle" },
      questionForm({ itemId, questionId: before.id, prompt, type: "SINGLE_CHOICE" }, [
        { id: before.optionIds[0], text: "interface", correct: true, explanation: "Erased." },
        // Cleared: the box the author emptied has to reach the column as null,
        // which only happens because the note is written on every save.
        { id: before.optionIds[1], text: "class", correct: false },
        { id: before.optionIds[2], text: "const", correct: false, explanation: "Still emitted." },
      ]),
    );
    expect(saved.status).toBe("done");

    const after = await pairsFor(prompt);
    expect(after.pairs).toEqual([
      ["interface", "Erased."],
      ["class", null],
      ["const", "Still emitted."],
    ]);
    // Same rows, not replacements: a recreate would drop nothing visible here but
    // would mean every edit churns ids the form is holding.
    expect(after.optionIds).toEqual(before.optionIds);
  });

  it("keeps notes on TRUE_FALSE, whose option text the server replaces", async () => {
    const prompt = `TypeScript checks types at runtime? ${run}`;

    const saved = await saveQuestion(
      { status: "idle" },
      // The posted text is ignored — normaliseOptions substitutes TRUE_FALSE_LABELS
      // — and rebuilding those rows is exactly where a note is easiest to drop.
      questionForm({ itemId, prompt, type: "TRUE_FALSE" }, [
        { text: "anything", correct: false, explanation: "Only the compiler checks." },
        { text: "at all", correct: true, explanation: "Checking happens before the emit." },
      ]),
    );
    expect(saved.status).toBe("done");

    const { pairs } = await pairsFor(prompt);
    expect(pairs).toEqual([
      ["True", "Only the compiler checks."],
      ["False", "Checking happens before the emit."],
    ]);
  });

  it("refuses a submission whose note array is short of its option array", async () => {
    const prompt = `Malformed ${run}`;
    const malformed = form({ itemId, prompt, type: "SINGLE_CHOICE" });
    for (const [index, text] of ["a", "b"].entries()) {
      malformed.append("optionId", "");
      malformed.append("optionText", text);
      if (index === 0) malformed.append("correct", "0");
    }
    // One note for two options: the arrays no longer line up, so there is no
    // answer to the question "whose note is this?".
    malformed.append("optionExplanation", "Belongs to which one?");

    const result = await saveQuestion({ status: "idle" }, malformed);

    expect(result.status).toBe("error");
    expect(await db.question.count({ where: { assessmentId, prompt } })).toBe(0);
  });
});
