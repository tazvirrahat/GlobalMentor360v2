import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import type { ThreadScope } from "@/lib/qa-rules";

// Re-exported so server callers have one import site; the Client Components
// import from lib/qa-rules directly (see the note in that file).
export * from "@/lib/qa-rules";

/**
 * Course Q&A: threaded questions per lecture and per course.
 *
 * INVARIANT 1 (docs/TECH-SPEC.md#invariants): posting requires a live enrollment,
 * and that is read from the Enrollment row via `isEnrolled` — never from an
 * order, a payment, or the fact that the player rendered a form. A server action
 * is a POST endpoint reachable without ever loading the page, so the checks live
 * here, in the write, rather than in whatever decided to render a textarea.
 *
 * The one exception is the course's own instructor, who may always reply. That
 * identity is derived from `Course.instructorId` inside these functions and is
 * never accepted as a parameter — `ThreadReply.isInstructor` is what the UI
 * attributes an answer to, so a client that could set it could impersonate the
 * instructor.
 */

/** One page of threads. The player already runs several queries; this must not grow with the course. */
const THREAD_PAGE_SIZE = 20;

export type QaReply = {
  id: string;
  body: string;
  createdAt: Date;
  /** Recorded at write time from Course.instructorId, not from anything the replier sent. */
  isInstructor: boolean;
  authorName: string;
};

export type QaThread = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  scope: ThreadScope;
  authorName: string;
  replies: QaReply[];
};

export type QaPanel = {
  threads: QaThread[];
  /** Visible threads beyond the page rendered, so the count can be honest. */
  hiddenByPageSize: number;
};

type ThreadRow = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  curriculumItemId: string | null;
  user: { name: string };
};

type ReplyRow = {
  id: string;
  threadId: string;
  body: string;
  createdAt: Date;
  isInstructor: boolean;
  user: { name: string };
};

/**
 * Attaches each reply to its thread in one pass over each list.
 *
 * Pure, and separate from the queries, because the failure it prevents is not
 * visible in a round trip: the obvious `replies.filter(r => r.threadId === t.id)`
 * inside the thread map is O(threads × replies), which is the same shape as the
 * N+1 the two-query read exists to avoid — just moved from the database into the
 * request that renders every lecture page.
 *
 * Input order is preserved, so the caller's `orderBy` is the whole sort: threads
 * newest first, replies oldest first, which is the order a conversation reads in.
 */
export function assembleThreads(threads: ThreadRow[], replies: ReplyRow[]): QaThread[] {
  const byThread = new Map<string, QaReply[]>();

  for (const reply of replies) {
    const bucket = byThread.get(reply.threadId);
    const mapped: QaReply = {
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt,
      isInstructor: reply.isInstructor,
      authorName: reply.user.name,
    };
    if (bucket) bucket.push(mapped);
    else byThread.set(reply.threadId, [mapped]);
  }

  return threads.map((thread) => ({
    id: thread.id,
    title: thread.title,
    body: thread.body,
    createdAt: thread.createdAt,
    // The item id itself never reaches the client: the page already knows which
    // lecture it is showing, and all the reader needs is which of the two lists
    // a thread came from.
    scope: thread.curriculumItemId === null ? "COURSE" : "LECTURE",
    authorName: thread.user.name,
    replies: byThread.get(thread.id) ?? [],
  }));
}

/**
 * Every thread a lecture page shows: the ones asked about this lecture, plus the
 * course-wide ones, which are visible throughout the course.
 *
 * Three queries, whatever the volume — a page of threads and their count in one
 * round trip, then every visible reply to that page in a second. Nothing here
 * runs per thread or per reply.
 */
export async function getCourseQaPanel(
  courseId: string,
  /** The lecture being shown, or null to list only the course-wide threads. */
  curriculumItemId: string | null,
): Promise<QaPanel> {
  const where: Prisma.QuestionThreadWhereInput = {
    courseId,
    // Moderation is not built yet, but the column has a default and a HIDDEN row
    // must never come back into a public list once someone sets one.
    status: "VISIBLE",
    // `{ curriculumItemId: undefined }` means "no filter" to Prisma, not "is
    // null". Spelling both cases out is what stops a missing item id from
    // listing every other lecture's threads here.
    ...(curriculumItemId === null
      ? { curriculumItemId: null }
      : { OR: [{ curriculumItemId: null }, { curriculumItemId }] }),
  };

  const [threadRows, total] = await Promise.all([
    db.questionThread.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: THREAD_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        curriculumItemId: true,
        user: { select: { name: true } },
      },
    }),
    db.questionThread.count({ where }),
  ]);

  const replyRows = threadRows.length
    ? await db.threadReply.findMany({
        where: { threadId: { in: threadRows.map((row) => row.id) }, status: "VISIBLE" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          threadId: true,
          body: true,
          createdAt: true,
          isInstructor: true,
          user: { select: { name: true } },
        },
      })
    : [];

  return {
    threads: assembleThreads(threadRows, replyRows),
    hiddenByPageSize: Math.max(0, total - threadRows.length),
  };
}

export type QaWriteResult = { ok: true; slug: string } | { ok: false; message: string };

/**
 * Opens a thread, scoped either to one lecture or to the whole course.
 *
 * The course is deliberately not filtered by publication status: unpublishing is
 * an authoring decision, not a refund, so a learner who is still enrolled in a
 * withdrawn course can still ask about it (same reasoning as `getPlayerCourse`).
 */
export async function askQuestion(input: {
  userId: string;
  courseId: string;
  /** Null for a course-wide thread. */
  curriculumItemId: string | null;
  title: string;
  body: string;
}): Promise<QaWriteResult> {
  // INVARIANT 1. `isEnrolled` reads the Enrollment row and nothing else, so a
  // refunded learner — enrolled once, `revokedAt` set since — is refused here
  // even though the form was legitimately rendered for them before the refund.
  if (!(await isEnrolled(input.userId, input.courseId))) {
    return { ok: false, message: "Only enrolled learners can ask questions in this course." };
  }

  if (input.curriculumItemId !== null) {
    // The pairing is the `where`, not an `if` on the result (see the header of
    // lib/studio.ts): a POST that pairs this course's id with another course's
    // lecture matches no row, so it cannot file a thread against a lecture the
    // learner has no entitlement to. Checking after the fetch is one early
    // return away from writing it anyway.
    const item = await db.curriculumItem.findFirst({
      where: { id: input.curriculumItemId, section: { courseId: input.courseId } },
      select: { id: true },
    });

    if (!item) return { ok: false, message: "That lecture isn't part of this course." };
  }

  const thread = await db.questionThread.create({
    data: {
      courseId: input.courseId,
      curriculumItemId: input.curriculumItemId,
      userId: input.userId,
      title: input.title,
      body: input.body,
    },
    // The slug comes back from the write rather than from the form, so the path
    // the action revalidates is one the database confirmed.
    select: { course: { select: { slug: true } } },
  });

  return { ok: true, slug: thread.course.slug };
}

/**
 * Answers a thread.
 *
 * Two kinds of people may reply: an enrolled learner, and the course's
 * instructor — who is usually not enrolled in their own course and must not need
 * to be. `isInstructor` is decided by comparing the replier to
 * `Course.instructorId` read in this query; it is not an input.
 */
export async function postReply(input: {
  userId: string;
  threadId: string;
  body: string;
}): Promise<QaWriteResult> {
  const thread = await db.questionThread.findFirst({
    // A hidden thread accepts no replies: leaving the write open would let a
    // moderated thread keep growing out of sight and reappear if unhidden.
    where: { id: input.threadId, status: "VISIBLE" },
    select: {
      id: true,
      courseId: true,
      course: { select: { slug: true, instructorId: true } },
    },
  });

  if (!thread) return { ok: false, message: "That question no longer exists." };

  const isInstructor = thread.course.instructorId === input.userId;

  // INVARIANT 1 again for everyone who is not the author of the course.
  if (!isInstructor && !(await isEnrolled(input.userId, thread.courseId))) {
    return { ok: false, message: "Only enrolled learners can reply in this course." };
  }

  await db.threadReply.create({
    data: {
      threadId: thread.id,
      userId: input.userId,
      body: input.body,
      isInstructor,
    },
    select: { id: true },
  });

  return { ok: true, slug: thread.course.slug };
}

// ---------------------------------------------------------------------------
// Instructor inbox
//
// An instructor teaching several courses otherwise has to open each course's
// player, lecture by lecture, to find out whether anyone is waiting on them.
// These reads answer "what needs me?" across every course they own.
// ---------------------------------------------------------------------------

/** Threads per page in the inbox. An instructor with 5,000 must not render them all. */
export const INBOX_PAGE_SIZE = 25;

export type InboxThread = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  askedBy: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  /** Null for a course-wide thread. */
  lectureTitle: string | null;
  replyCount: number;
  /** Whether the instructor has answered. Drives the "unanswered" filter. */
  answered: boolean;
};

export type InboxFilters = {
  /** Restrict to one course; undefined means every course this instructor owns. */
  courseId?: string;
  /** Only threads the instructor has not answered. */
  unansweredOnly?: boolean;
  /** Only threads opened on or after this instant. */
  since?: Date;
  page?: number;
};

export type InboxPage = {
  threads: InboxThread[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * "Unanswered" means *the instructor* has not replied — not that nobody has.
 *
 * The alternative reading (no replies at all) hides the case that matters most:
 * a thread where learners have been guessing at an answer for a week still needs
 * the instructor, and under a reply-count test it would look handled. Expressed
 * as a relation filter (`replies: { none: { isInstructor: true } }`) so the
 * database applies it, rather than over-fetching and filtering in memory.
 */
export async function getInstructorInbox(
  instructorId: string,
  filters: InboxFilters = {},
): Promise<InboxPage> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));

  // Ownership is the `where`, not a check afterwards (lib/studio.ts header): a
  // courseId belonging to another instructor narrows this to nothing rather than
  // widening it to their threads.
  const where = {
    status: "VISIBLE" as const,
    course: { instructorId, ...(filters.courseId ? { id: filters.courseId } : {}) },
    ...(filters.unansweredOnly ? { replies: { none: { isInstructor: true } } } : {}),
    ...(filters.since ? { createdAt: { gte: filters.since } } : {}),
  };

  // Two queries regardless of how many threads come back: the reply count and
  // the answered flag are aggregated by the database, not by a query per row.
  const [total, rows] = await Promise.all([
    db.questionThread.count({ where }),
    db.questionThread.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * INBOX_PAGE_SIZE,
      take: INBOX_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        user: { select: { name: true } },
        course: { select: { id: true, title: true, slug: true } },
        curriculumItem: { select: { title: true } },
        _count: { select: { replies: { where: { status: "VISIBLE" } } } },
        replies: {
          where: { isInstructor: true, status: "VISIBLE" },
          take: 1,
          select: { id: true },
        },
      },
    }),
  ]);

  return {
    threads: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      askedBy: row.user.name,
      courseId: row.course.id,
      courseTitle: row.course.title,
      courseSlug: row.course.slug,
      lectureTitle: row.curriculumItem?.title ?? null,
      replyCount: row._count.replies,
      // `take: 1` above makes this an existence check rather than a count.
      answered: row.replies.length > 0,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE)),
  };
}

/** The courses the inbox filter offers, with how many threads are waiting on each. */
export async function getInboxCourseFilters(instructorId: string) {
  const courses = await db.course.findMany({
    where: { instructorId },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      _count: {
        select: {
          threads: {
            where: { status: "VISIBLE", replies: { none: { isInstructor: true } } },
          },
        },
      },
    },
  });

  return courses.map((course) => ({
    id: course.id,
    title: course.title,
    unanswered: course._count.threads,
  }));
}
