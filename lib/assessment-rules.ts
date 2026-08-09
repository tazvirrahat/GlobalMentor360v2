import type { QuestionType } from "@/generated/prisma/enums";

/**
 * The answer-option rules, and nothing that touches a database.
 *
 * Split out of lib/assessments.ts because the quiz builder is a Client Component
 * and needs these constants. Importing them from the module that also holds the
 * Prisma reads pulled lib/db.ts — and through it @prisma/adapter-pg and pg —
 * into the browser bundle, which fails the build outright on `require('dns')`.
 *
 * The rule this encodes: anything a Client Component imports must be reachable
 * without reaching lib/db.ts. Server callers can keep importing from
 * lib/assessments.ts, which re-exports everything here.
 */

/**
 * Matches DEFAULT_PASS_THRESHOLD in lib/progress.ts. A new quiz stores the value
 * explicitly rather than leaving the column null, so an author who never opens
 * the settings form still sees the mark the grader will actually apply.
 */
export const DEFAULT_PASS_THRESHOLD_PCT = 70;

/** Below two, a "choice" question offers no choice. */
export const MIN_OPTIONS = 2;

/** A bound on the form, not a rule of the domain. Past this it is a survey. */
export const MAX_OPTIONS = 10;

/**
 * The only two option texts a TRUE_FALSE question may have.
 *
 * Authors pick which side is correct; the labels are ours. Enforcing that here
 * rather than in the form is what stops a direct POST from producing a
 * TRUE_FALSE question whose options say anything at all.
 */
export const TRUE_FALSE_LABELS = ["True", "False"] as const;

export type OptionDraft = {
  /** Null for a new option. Existing ids are re-checked against the row before use. */
  id: string | null;
  text: string;
  isCorrect: boolean;
};

export type NormalisedOptions =
  | { ok: true; options: OptionDraft[] }
  | { ok: false; message: string };

/**
 * The shape an answer set must have before it is allowed near the database.
 *
 * The zero-correct case is the one that matters, and not for the reason it looks
 * like. lib/progress.ts grades by exact set match — `selected.size ===
 * correctIds.size && every(selected) is correct` — so on a question with no
 * correct option a learner who answers *nothing* satisfies both halves (0 === 0,
 * and an empty `every` is true) and is marked correct. It is a free point awarded
 * for skipping the question, not an unpassable wall. Either way the question
 * measures nothing, and the studio cannot show the author that it doesn't, so it
 * is refused at the write.
 */
export function normaliseOptions(type: QuestionType, submitted: OptionDraft[]): NormalisedOptions {
  if (type === "TRUE_FALSE") {
    // Padded rather than rejected so a short submission produces the real error
    // ("mark one as correct") instead of a row-count complaint. Destructured
    // because an index lookup stays `T | undefined` however the array was built.
    const [first, second] = [0, 1].map(
      (index): OptionDraft => submitted[index] ?? { id: null, text: "", isCorrect: false },
    ) as [OptionDraft, OptionDraft];

    if ([first, second].filter((row) => row.isCorrect).length !== 1) {
      return { ok: false, message: "Mark exactly one of True or False as correct." };
    }

    return {
      ok: true,
      options: TRUE_FALSE_LABELS.map((text, index) => {
        const row = index === 0 ? first : second;
        return { id: row.id, text, isCorrect: row.isCorrect };
      }),
    };
  }

  if (submitted.length < MIN_OPTIONS) {
    return { ok: false, message: `A question needs at least ${MIN_OPTIONS} answer options.` };
  }
  if (submitted.length > MAX_OPTIONS) {
    return { ok: false, message: `A question can have at most ${MAX_OPTIONS} answer options.` };
  }

  const options = submitted.map((option) => ({ ...option, text: option.text.trim() }));
  if (options.some((option) => option.text.length === 0)) {
    return { ok: false, message: "Every answer option needs text." };
  }

  const correctCount = options.filter((option) => option.isCorrect).length;

  if (type === "SINGLE_CHOICE" && correctCount !== 1) {
    return { ok: false, message: "A single-choice question needs exactly one correct option." };
  }
  if (type === "MULTI_SELECT" && correctCount === 0) {
    return { ok: false, message: "Mark at least one option correct." };
  }

  return { ok: true, options };
}
