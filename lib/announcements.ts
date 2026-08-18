import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { isEnrolled } from "@/lib/entitlement";
import { notifyMany } from "@/lib/notifications";
import { clampPage, pageCount, skipTake, type Paged } from "@/lib/pagination";

// Re-exported so server callers have one import site; the composer imports from
// lib/announcement-rules directly (see the note in that file).
export * from "@/lib/announcement-rules";

/**
 * Course announcements: an instructor writes once, every enrolled learner reads
 * it in the player and receives it by email.
 *
 * Two rules shape everything here. Only the course's own instructor may post,
 * checked inside the query rather than after it (see the lib/studio.ts header).
 * And only a live enrollment receives one — entitlement is the Enrollment row
 * and nothing else (invariant 1), so a refunded learner drops off the recipient
 * list without anyone maintaining a second list.
 */

export type CourseAnnouncement = {
  id: string;
  subject: string;
  body: string;
  sentAt: Date | null;
  authorName: string;
};

/**
 * How many announcements a learner sees in the player.
 *
 * This read runs on every lecture page view, so it has to be bounded by
 * something other than how long the course has been taught — matching
 * THREAD_PAGE_SIZE in lib/qa.ts and REVIEW_PAGE_SIZE in lib/reviews.ts, the two
 * other learner-facing lists. Newest first, so the cap drops the ones already
 * read rather than the ones that just arrived.
 */
export const ANNOUNCEMENT_PAGE_SIZE = 20;

/** Studio "Sent" list. Separate from the learner-facing cap above. */
export const SENT_ANNOUNCEMENT_PAGE_SIZE = 25;

/** How many recipients one send will mail before it refuses. See sendAnnouncement. */
export const MAX_INLINE_RECIPIENTS = 500;

/** Emails are dispatched this many at a time, to bound open sockets to SES. */
const EMAIL_CONCURRENCY = 10;

/**
 * The announcements a learner may read.
 *
 * Drafts (`sentAt` null) are excluded: an unsent announcement is the
 * instructor's working copy, and the player is not where it should first appear.
 */
export async function getLearnerAnnouncements(
  userId: string,
  courseId: string,
): Promise<CourseAnnouncement[]> {
  if (!(await isEnrolled(userId, courseId))) return [];

  const rows = await db.announcement.findMany({
    where: { courseId, sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    take: ANNOUNCEMENT_PAGE_SIZE,
    select: {
      id: true,
      subject: true,
      body: true,
      sentAt: true,
      author: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    body: row.body,
    sentAt: row.sentAt,
    authorName: row.author.name,
  }));
}

export type SentAnnouncement = {
  id: string;
  subject: string;
  body: string;
  sentAt: Date | null;
  course: { title: string };
};

/**
 * What this instructor has sent, newest first.
 *
 * Scoped by author, not by course: an ADMIN who posted to a course they teach
 * sees their own posts here, not everyone's. A bare `take` without skip hid
 * older rows and offered no way to reach them.
 */
export async function listSentAnnouncements(
  authorId: string,
  page?: string | number,
): Promise<Paged<SentAnnouncement>> {
  const where = { authorId };
  const total = await db.announcement.count({ where });
  const current = clampPage(page, total, SENT_ANNOUNCEMENT_PAGE_SIZE);
  const { skip, take } = skipTake(current, SENT_ANNOUNCEMENT_PAGE_SIZE);
  const items = await db.announcement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      subject: true,
      body: true,
      sentAt: true,
      course: { select: { title: true } },
    },
  });

  return {
    items,
    total,
    page: current,
    pageCount: pageCount(total, SENT_ANNOUNCEMENT_PAGE_SIZE),
  };
}

/** The courses the composer offers, so an instructor picks rather than types an id. */
export async function listAnnouncableCourses(instructorId: string) {
  return db.course.findMany({
    where: { instructorId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      _count: { select: { enrollments: { where: { revokedAt: null } } } },
    },
  });
}

export type SendResult =
  | { ok: true; announcementId: string; recipients: number; emailFailures: number }
  | { ok: false; message: string };

/**
 * Records the announcement, then mails it.
 *
 * **The announcement is committed before any email is attempted, and a failed
 * send never rolls it back.** The row is the announcement; email is one delivery
 * channel for it. Discarding a written announcement because SES was briefly
 * unreachable would destroy the instructor's work and remove the in-player copy
 * that does not depend on email at all — trading a recoverable delivery problem
 * for an unrecoverable authoring one. The count of failures is returned instead,
 * so the composer can say plainly that the post succeeded and N emails did not.
 *
 * Note lib/email.ts throws in production when SES is unconfigured. That is
 * deliberate there, and it is why the sends are caught individually here: one
 * bad address must not stop the rest of the cohort receiving theirs.
 */
export async function sendAnnouncement(input: {
  instructorId: string;
  courseId: string;
  subject: string;
  body: string;
}): Promise<SendResult> {
  // Ownership is the `where`, not a check on the result.
  const course = await db.course.findFirst({
    where: { id: input.courseId, instructorId: input.instructorId },
    select: { id: true, title: true, slug: true },
  });

  if (!course) {
    return { ok: false, message: "Course not found, or you do not teach it." };
  }

  const recipients = await db.enrollment.findMany({
    where: { courseId: course.id, revokedAt: null },
    select: { userId: true, user: { select: { email: true, name: true } } },
    take: MAX_INLINE_RECIPIENTS + 1,
  });

  // There is no job queue in this project yet (TECH-SPEC plans Redis + BullMQ),
  // so the send happens inside the request. That is honest at seminar scale and
  // wrong at cohort scale: a few thousand SES calls will exhaust the request
  // before it finishes, and a half-sent announcement has no resume path. Refuse
  // rather than half-send, and make the queue the explicit prerequisite.
  if (recipients.length > MAX_INLINE_RECIPIENTS) {
    return {
      ok: false,
      message:
        `This course has more than ${MAX_INLINE_RECIPIENTS} learners. Sending that many ` +
        "emails needs the background queue, which is not built yet.",
    };
  }

  const announcement = await db.announcement.create({
    data: {
      courseId: course.id,
      authorId: input.instructorId,
      subject: input.subject,
      body: input.body,
      // Set here rather than after the mail run: sentAt records that the
      // instructor published it, which is true regardless of SES.
      sentAt: new Date(),
    },
    select: { id: true },
  });

  await notifyMany(
    recipients.map((row) => row.userId),
    "announcement",
    {
      title: input.subject,
      body: course.title,
      href: `/learn/${course.slug}`,
    },
  );

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  let emailFailures = 0;

  for (let index = 0; index < recipients.length; index += EMAIL_CONCURRENCY) {
    const batch = recipients.slice(index, index + EMAIL_CONCURRENCY);

    const settled = await Promise.allSettled(
      batch.map((row) =>
        sendEmail({
          to: row.user.email,
          subject: `${course.title}: ${input.subject}`,
          text: `${input.body}\n\n— ${course.title}`,
          actionUrl: `${base}/learn/${course.slug}`,
          actionLabel: "Open the course",
        }),
      ),
    );

    for (const result of settled) {
      if (result.status === "rejected") {
        emailFailures += 1;
        console.error("Announcement email failed:", result.reason);
      }
    }
  }

  return {
    ok: true,
    announcementId: announcement.id,
    recipients: recipients.length,
    emailFailures,
  };
}
