import { db } from "@/lib/db";
import type { OptionDraft } from "@/lib/assessment-rules";

// Re-exported so server callers have one import site; the Client Component
// imports from lib/assessment-rules directly (see the note in that file).
export * from "@/lib/assessment-rules";

/**
 * Authoring-side assessment reads, guards, and the answer-option rules.
 *
 * Ownership is checked inside the query rather than after it, for the reason
 * given in the lib/studio.ts header.
 *
 * The reads here deliberately select `AnswerOption.isCorrect`, which the
 * learner-facing read in lib/progress.ts deliberately does not. These queries
 * back instructor-only studio pages, and an author who cannot see which option
 * is correct cannot edit it. Nothing in this file may be reused on a learner
 * path — grading stays server-side.
 */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Replaces a question's options with the submitted set, reusing rows by id.
 *
 * Ids arrive from the client, so an id is honoured only when it already belongs
 * to *this* question — otherwise a crafted POST would rewrite an option on
 * someone else's quiz through an `update where id`. Unrecognised ids fall through
 * to a create, which is the same outcome the author intended.
 *
 * Positions are written in one pass, unlike Question and CurriculumItem: there is
 * no @@unique on (questionId, position), so the intermediate states are legal.
 */
export async function writeQuestionOptions(tx: Tx, questionId: string, options: OptionDraft[]) {
  const existing = await tx.answerOption.findMany({
    where: { questionId },
    select: { id: true },
  });
  const owned = new Set(existing.map((row) => row.id));

  const kept = new Set(
    options.map((option) => option.id).filter((id): id is string => id !== null && owned.has(id)),
  );
  const removed = [...owned].filter((id) => !kept.has(id));
  if (removed.length > 0) {
    // QuizAttemptAnswer.selectedOptionIds is a String[] with no foreign key, so a
    // past attempt survives this — and it stored its own isCorrect, so the
    // learner's recorded score does not shift under an edit.
    await tx.answerOption.deleteMany({ where: { id: { in: removed } } });
  }

  for (const [position, option] of options.entries()) {
    const id = option.id !== null && owned.has(option.id) ? option.id : null;
    const data = { text: option.text, isCorrect: option.isCorrect, position };

    if (id) {
      await tx.answerOption.update({ where: { id }, data });
    } else {
      await tx.answerOption.create({ data: { questionId, ...data } });
    }
  }
}

/**
 * Rewrites question positions to 0..n-1.
 *
 * Two passes with negative parking positions for the same reason as the
 * `resequence` helper in app/studio/curriculum-actions.ts: @@unique on
 * (assessmentId, position) rejects the intermediate states of a single pass.
 */
export async function resequenceQuestions(tx: Tx, assessmentId: string) {
  const rows = await tx.question.findMany({
    where: { assessmentId },
    orderBy: { position: "asc" },
    select: { id: true },
  });

  for (const [index, row] of rows.entries()) {
    await tx.question.update({ where: { id: row.id }, data: { position: -(index + 1) } });
  }
  for (const [index, row] of rows.entries()) {
    await tx.question.update({ where: { id: row.id }, data: { position: index } });
  }
}

/**
 * A QUIZ curriculum item with its assessment, only if the owning course belongs
 * to this instructor. Returns null for a missing item, another instructor's item,
 * and an item that is not a quiz — the caller cannot tell which, deliberately.
 */
export async function getOwnedAssessment(itemId: string, instructorId: string) {
  return db.curriculumItem.findFirst({
    where: {
      id: itemId,
      type: "QUIZ",
      section: { course: { instructorId } },
    },
    select: {
      id: true,
      section: { select: { courseId: true } },
      assessment: { select: { id: true } },
    },
  });
}

/**
 * A question with its options, scoped to the instructor who owns the course.
 * The whole chain — question → assessment → item → section → course → instructor
 * — is one `where`, so there is no point at which an unowned row is in hand.
 */
export async function getOwnedQuestion(questionId: string, instructorId: string) {
  return db.question.findFirst({
    where: {
      id: questionId,
      assessment: { curriculumItem: { section: { course: { instructorId } } } },
    },
    select: {
      id: true,
      assessmentId: true,
      position: true,
      assessment: {
        select: {
          curriculumItem: {
            select: { id: true, section: { select: { courseId: true } } },
          },
        },
      },
    },
  });
}

