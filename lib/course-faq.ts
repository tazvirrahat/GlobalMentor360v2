/**
 * The course FAQ as the studio form posts it: two parallel arrays, one
 * question and one answer per row, in the order the instructor arranged them.
 */

export const FAQ_MAX = 20;
export const FAQ_QUESTION_MAX = 300;
export const FAQ_ANSWER_MAX = 2000;

export type FaqRow = { question: string; answer: string };

/**
 * Pairs questions with answers by position. A row left entirely blank is
 * dropped (the editor always offers an empty one); a row with only one side is
 * refused rather than saved half-written.
 */
export function readFaqRows(
  questions: string[],
  answers: string[],
): { ok: true; rows: FaqRow[] } | { ok: false; message: string } {
  const rows: FaqRow[] = [];
  const count = Math.max(questions.length, answers.length);
  for (let index = 0; index < count; index++) {
    const question = (questions[index] ?? "").trim();
    const answer = (answers[index] ?? "").trim();
    if (!question && !answer) continue;
    if (!question || !answer) {
      return { ok: false, message: "Each question needs an answer, and each answer a question." };
    }
    if (question.length > FAQ_QUESTION_MAX) {
      return { ok: false, message: `Keep each question under ${FAQ_QUESTION_MAX} characters.` };
    }
    if (answer.length > FAQ_ANSWER_MAX) {
      return { ok: false, message: `Keep each answer under ${FAQ_ANSWER_MAX} characters.` };
    }
    rows.push({ question, answer });
  }
  if (rows.length > FAQ_MAX) {
    return { ok: false, message: `A course can have up to ${FAQ_MAX} questions.` };
  }
  return { ok: true, rows };
}
