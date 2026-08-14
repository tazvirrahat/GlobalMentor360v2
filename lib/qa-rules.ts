import { z } from "zod";

/**
 * The Q&A submission rules, and nothing that touches a database.
 *
 * Split out of lib/qa.ts for the reason recorded in lib/assessment-rules.ts: the
 * ask and reply forms are Client Components and need these bounds for their
 * `maxLength`. Importing them from the module that also holds the Prisma reads
 * pulls lib/db.ts — and through it @prisma/adapter-pg and pg — into the browser
 * bundle, which fails the build outright on `require('dns')`.
 *
 * Server callers import from lib/qa.ts, which re-exports everything here, so the
 * bound the form enforces and the bound the schema enforces are the same number
 * rather than two literals that drift.
 */

/** Long enough for a real question, short enough to stay a heading in the list. */
export const QUESTION_TITLE_MAX = 200;
export const QUESTION_BODY_MAX = 5000;
export const REPLY_BODY_MAX = 5000;

const THREAD_SCOPES = ["LECTURE", "COURSE"] as const;

/**
 * Which surface a thread belongs to.
 *
 * The column behind it is the nullable `question_threads.curriculum_item_id`:
 * COURSE threads store null and are listed on every lecture of the course,
 * LECTURE threads store an item id and are listed only on that lecture.
 */
export type ThreadScope = (typeof THREAD_SCOPES)[number];

export const questionSubmissionSchema = z.object({
  courseId: z.string().min(1),
  /**
   * The lecture the player is currently showing — posted whatever the scope is,
   * because "which lecture am I looking at" and "which lecture is this thread
   * about" are different questions. `scope` decides whether the write uses it.
   */
  curriculumItemId: z.string().trim(),
  scope: z.enum(THREAD_SCOPES),
  title: z
    .string()
    .trim()
    .min(5, "Give your question a title of at least 5 characters.")
    .max(QUESTION_TITLE_MAX, `Keep the title under ${QUESTION_TITLE_MAX} characters.`),
  body: z
    .string()
    .trim()
    .min(10, "Add a bit more detail so someone can answer.")
    .max(QUESTION_BODY_MAX, `Keep your question under ${QUESTION_BODY_MAX} characters.`),
});

export type QuestionSubmission = z.infer<typeof questionSubmissionSchema>;

export const replySubmissionSchema = z.object({
  threadId: z.string().min(1),
  body: z
    .string()
    .trim()
    .min(2, "Write a reply first.")
    .max(REPLY_BODY_MAX, `Keep your reply under ${REPLY_BODY_MAX} characters.`),
});

export type ReplySubmission = z.infer<typeof replySubmissionSchema>;
