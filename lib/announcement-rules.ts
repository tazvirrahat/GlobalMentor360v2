import { z } from "zod";

/**
 * The announcement submission rules, and nothing that touches a database.
 *
 * Split out of lib/announcements.ts for the reason recorded in
 * lib/assessment-rules.ts: the composer is a Client Component and needs these
 * bounds for its `maxLength`. Importing them from the module that also holds the
 * Prisma reads pulls lib/db.ts — and through it @prisma/adapter-pg and pg — into
 * the browser bundle, which fails the build outright on `require('dns')`.
 *
 * Server callers import from lib/announcements.ts, which re-exports everything
 * here, so the bound the form enforces and the bound the schema enforces are the
 * same number rather than two literals that drift.
 */

/** Fits an email subject line without being truncated by a mail client. */
export const ANNOUNCEMENT_SUBJECT_MAX = 150;
export const ANNOUNCEMENT_BODY_MAX = 10_000;

export const announcementSubmissionSchema = z.object({
  courseId: z.string().min(1),
  subject: z
    .string()
    .trim()
    .min(4, "Give the announcement a subject learners will recognise.")
    .max(ANNOUNCEMENT_SUBJECT_MAX),
  body: z
    .string()
    .trim()
    .min(1, "An announcement needs a body.")
    .max(ANNOUNCEMENT_BODY_MAX),
});

export type AnnouncementSubmission = z.infer<typeof announcementSubmissionSchema>;

export type AnnouncementCourseOption = {
  id: string;
  status: string;
  learnerCount: number;
};

/**
 * Default for the composer combobox.
 *
 * List order is recency (`updatedAt`), so a freshly saved 0-learner draft sits
 * first. Sending then posts to that draft instead of the course that actually
 * has learners. Prefer a published owned course with live enrollments, then any
 * published owned course, then the first owned row the caller passed.
 */
export function pickDefaultAnnouncementCourseId(
  courses: AnnouncementCourseOption[],
): string | undefined {
  const publishedWithLearners = courses.find(
    (course) => course.status === "PUBLISHED" && course.learnerCount > 0,
  );
  if (publishedWithLearners) return publishedWithLearners.id;

  const published = courses.find((course) => course.status === "PUBLISHED");
  if (published) return published.id;

  return courses[0]?.id;
}
