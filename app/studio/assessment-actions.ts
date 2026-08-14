"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getOwnedAssessment,
  getOwnedQuestion,
  MAX_OPTIONS,
  normaliseOptions,
  QUESTION_MOVE_PARK_POSITION,
  resequenceQuestions,
  writeQuestionOptions,
  type OptionDraft,
} from "@/lib/assessments";
import { requireRole } from "@/lib/session";

/**
 * The quiz builder's writes.
 *
 * Every action re-derives the assessment from the signed-in instructor, so the
 * only thing the client is trusted to say is *which* row to act on. Ownership is
 * part of each `where` (see lib/assessments.ts).
 */

export type AssessmentState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/** Both studio views of a quiz go stale on every write, so both are revalidated. */
function revalidateQuiz(courseId: string, itemId: string) {
  revalidatePath(`/studio/courses/${courseId}/curriculum`);
  revalidatePath(`/studio/courses/${courseId}/curriculum/${itemId}`);
}

/** Hours-long limits are a typo, not a quiz. */
const MAX_TIME_LIMIT_MINUTES = 600;

const settingsSchema = z.object({
  itemId: z.string().min(1),
  title: z.string().trim().min(1, "Give the quiz a title.").max(200),
  description: z.string().trim().max(2000),
  // A threshold of 0 would pass an empty answer sheet, which is not a quiz. 100
  // is allowed — some authors do want every question right.
  passThresholdPct: z.coerce
    .number()
    .int()
    .min(1, "Pass mark must be between 1 and 100.")
    .max(100, "Pass mark must be between 1 and 100."),
  timeLimitMinutes: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(MAX_TIME_LIMIT_MINUTES)])
    .optional(),
  allowRetakes: z.boolean(),
  shuffleQuestions: z.boolean(),
});

export async function updateAssessment(
  _prev: AssessmentState,
  formData: FormData,
): Promise<AssessmentState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const parsed = settingsSchema.safeParse({
    itemId: formData.get("itemId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    passThresholdPct: formData.get("passThresholdPct"),
    timeLimitMinutes: formData.get("timeLimitMinutes") ?? "",
    // An unchecked box submits nothing at all, so absence is the "off" signal.
    allowRetakes: formData.get("allowRetakes") !== null,
    shuffleQuestions: formData.get("shuffleQuestions") !== null,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const input = parsed.data;

  const item = await getOwnedAssessment(input.itemId, user.id);
  if (!item?.assessment) return { status: "error", message: "Quiz not found." };

  await db.$transaction([
    db.curriculumItem.update({ where: { id: item.id }, data: { title: input.title } }),
    db.assessment.update({
      where: { id: item.assessment.id },
      data: {
        description: input.description || null,
        passThresholdPct: input.passThresholdPct,
        timeLimitSeconds:
          typeof input.timeLimitMinutes === "number" ? input.timeLimitMinutes * 60 : null,
        allowRetakes: input.allowRetakes,
        shuffleQuestions: input.shuffleQuestions,
      },
    }),
  ]);

  revalidateQuiz(item.section.courseId, item.id);
  return { status: "done", message: "Saved." };
}

const questionSchema = z.object({
  itemId: z.string().min(1),
  // Empty for a new question. Every caller passes `?? ""`, and z.string() already
  // accepts "", so neither .optional() nor an explicit "" branch buys anything.
  questionId: z.string(),
  prompt: z.string().trim().min(1, "A question needs a prompt.").max(2000),
  type: z.enum(["SINGLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE"]),
  explanation: z.string().trim().max(2000),
  knowledgeArea: z.string().trim().max(80),
});

/**
 * Reads the repeated option inputs back into rows.
 *
 * The four arrays are positional: row `i` is `optionText[i]`, its per-answer note
 * is `optionExplanation[i]`, its id is `optionId[i]` (empty for a new row), and it
 * is correct when `i` appears in `correct`. Indexing by position rather than by id
 * is what lets a brand-new option be marked correct before it has an id at all —
 * radios and checkboxes both submit under one `correct` name, so the same parse
 * handles every type.
 *
 * The length equality is the whole safety of that scheme, which is why a mismatch
 * is refused rather than padded: one missing `optionExplanation` would shift every
 * later note onto the wrong answer, and the result would save cleanly and read as
 * the author's own words.
 */
function readOptionDrafts(formData: FormData): OptionDraft[] | null {
  const ids = formData.getAll("optionId").map(String);
  const texts = formData.getAll("optionText").map(String);
  const explanations = formData.getAll("optionExplanation").map(String);
  const correct = new Set(formData.getAll("correct").map((value) => Number(value)));

  if (ids.length !== texts.length) return null;
  if (explanations.length !== texts.length) return null;
  if (texts.length > MAX_OPTIONS) return null;

  return texts.map((text, index) => ({
    id: ids[index] || null,
    text,
    isCorrect: correct.has(index),
    explanation: explanations[index]?.trim() || null,
  }));
}

/**
 * Creates or updates one question and its options.
 *
 * Create and update share a path because they share every rule; the only
 * difference is whether an owned question id was supplied. The whole write is one
 * transaction, so a question can never be left holding the previous version's
 * options after a partial failure.
 */
export async function saveQuestion(
  _prev: AssessmentState,
  formData: FormData,
): Promise<AssessmentState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const parsed = questionSchema.safeParse({
    itemId: formData.get("itemId"),
    questionId: formData.get("questionId") ?? "",
    prompt: formData.get("prompt"),
    type: formData.get("type"),
    explanation: formData.get("explanation") ?? "",
    knowledgeArea: formData.get("knowledgeArea") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const input = parsed.data;

  const drafts = readOptionDrafts(formData);
  if (!drafts) return { status: "error", message: "Answer options were submitted malformed." };

  const options = normaliseOptions(input.type, drafts);
  if (!options.ok) return { status: "error", message: options.message };

  const item = await getOwnedAssessment(input.itemId, user.id);
  if (!item?.assessment) return { status: "error", message: "Quiz not found." };
  const assessmentId = item.assessment.id;

  const fields = {
    prompt: input.prompt,
    type: input.type,
    explanation: input.explanation || null,
    knowledgeArea: input.knowledgeArea || null,
  };

  if (input.questionId) {
    // Scoped to the instructor *and* re-checked against this assessment, so a
    // question id borrowed from another quiz resolves to nothing.
    const existing = await getOwnedQuestion(input.questionId, user.id);
    if (!existing || existing.assessmentId !== assessmentId) {
      return { status: "error", message: "Question not found." };
    }

    await db.$transaction(async (tx) => {
      await tx.question.update({ where: { id: existing.id }, data: fields });
      await writeQuestionOptions(tx, existing.id, options.options);
    });

    revalidateQuiz(item.section.courseId, item.id);
    return { status: "done", message: "Question saved." };
  }

  await db.$transaction(async (tx) => {
    const last = await tx.question.findFirst({
      where: { assessmentId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const question = await tx.question.create({
      data: { assessmentId, ...fields, position: (last?.position ?? -1) + 1 },
      select: { id: true },
    });

    await writeQuestionOptions(tx, question.id, options.options);
  });

  revalidateQuiz(item.section.courseId, item.id);
  return { status: "done", message: "Question added." };
}

export async function deleteQuestion(
  _prev: AssessmentState,
  formData: FormData,
): Promise<AssessmentState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const questionId = String(formData.get("questionId") ?? "");

  const question = await getOwnedQuestion(questionId, user.id);
  if (!question) return { status: "error", message: "Question not found." };

  await db.$transaction(async (tx) => {
    // The opposite trade from the one writeQuestionOptions makes for a deleted
    // option, and worth stating because it is the destructive one.
    // QuizAttemptAnswer.questionId is a real foreign key with onDelete: Cascade, so
    // every learner's record of what they answered *here* goes with the row, while
    // QuizAttempt.scorePct keeps the score that was computed from it. The attempt
    // goes on saying 60% with one fewer answer behind it.
    //
    // Accepted, not overlooked. Nothing reads those rows today — they are written
    // by submitQuizAttempt and read by nobody — so the cost falls entirely on the
    // per-question review of a past attempt that docs/FEATURES.md section D still
    // lists as unbuilt, and the alternative is answers pointing at a question that
    // no longer exists, which that review could not render either. What must not
    // move is scorePct: an author editing a quiz cannot be allowed to restate a
    // grade a learner has already been given, which is the same reason an edited
    // option leaves past attempts alone.
    await tx.question.delete({ where: { id: question.id } });
    // Close the gap. @@unique([assessmentId, position]) makes a sparse sequence a
    // trap for the next insert, which computes its position from the maximum.
    await resequenceQuestions(tx, question.assessmentId);
  });

  const item = question.assessment.curriculumItem;
  revalidateQuiz(item.section.courseId, item.id);
  return { status: "done", message: "Question deleted." };
}

export async function moveQuestion(
  _prev: AssessmentState,
  formData: FormData,
): Promise<AssessmentState> {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const questionId = String(formData.get("questionId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const question = await getOwnedQuestion(questionId, user.id);
  if (!question) return { status: "error", message: "Question not found." };

  const delta = direction === "up" ? -1 : 1;
  const neighbour = await db.question.findFirst({
    where: { assessmentId: question.assessmentId, position: question.position + delta },
    select: { id: true, position: true },
  });
  if (!neighbour) return { status: "done", message: "Already at the end." };

  // Same collision as moveItem: @@unique([assessmentId, position]) rejects the
  // intermediate state of a direct swap, so park one row out of range first. The
  // slot is reserved from resequenceQuestions — see QUESTION_MOVE_PARK_POSITION.
  await db.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: question.id },
      data: { position: QUESTION_MOVE_PARK_POSITION },
    });
    await tx.question.update({ where: { id: neighbour.id }, data: { position: question.position } });
    await tx.question.update({ where: { id: question.id }, data: { position: neighbour.position } });
  });

  const item = question.assessment.curriculumItem;
  revalidateQuiz(item.section.courseId, item.id);
  return { status: "done", message: "Moved." };
}
