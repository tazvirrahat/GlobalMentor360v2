import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import { notify } from "@/lib/notifications";
import { clampPage, pageCount, parsePage, skipTake } from "@/lib/pagination";
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
 * Reads are gated the same way: `getCourseQaPanel` returns an empty panel unless
 * the caller is enrolled, the course instructor, or an admin. Hiding the Q&A
 * UI on the player page is not the authorization.
 *
 * The one exception is the course's own instructor, who may always reply. That
 * identity is derived from `Course.instructorId` inside these functions and is
 * never accepted as a parameter — `ThreadReply.isInstructor` is what the UI
 * attributes an answer to, so a client that could set it could impersonate the
 * instructor.
 */

/** One page of threads. The player already runs several queries; this must not grow with the course. */
export const THREAD_PAGE_SIZE = 20;
/** Last N replies per thread. Older ones are counted, not loaded. */
export const REPLY_PAGE_SIZE = 50;

export function earlierRepliesCopy(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 earlier reply" : `${count} earlier replies`;
}

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
  /** Visible replies older than the last REPLY_PAGE_SIZE. */
  earlierReplyCount: number;
};

export type QaPanel = {
  threads: QaThread[];
  total: number;
  page: number;
  pageCount: number;
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
export function assembleThreads(
  threads: ThreadRow[],
  replies: ReplyRow[],
  earlierByThread: ReadonlyMap<string, number> = new Map(),
): QaThread[] {
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
    earlierReplyCount: earlierByThread.get(thread.id) ?? 0,
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
const EMPTY_QA_PANEL: QaPanel = { threads: [], total: 0, page: 1, pageCount: 1 };

async function canReadCourseQa(userId: string, courseId: string): Promise<boolean> {
  if (await isEnrolled(userId, courseId)) return true;

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { instructorId: true },
  });
  if (course?.instructorId === userId) return true;

  const admin = await db.userRole.findUnique({
    where: { userId_role: { userId, role: "ADMIN" } },
    select: { role: true },
  });
  return admin !== null;
}

export async function getCourseQaPanel(
  courseId: string,
  /** The lecture being shown, or null to list only the course-wide threads. */
  curriculumItemId: string | null,
  userId: string,
  page?: string | number,
): Promise<QaPanel> {
  if (!(await canReadCourseQa(userId, courseId))) return EMPTY_QA_PANEL;

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

  const requested = parsePage(page);
  const total = await db.questionThread.count({ where });
  const current = clampPage(requested, total, THREAD_PAGE_SIZE);
  const { skip, take } = skipTake(current, THREAD_PAGE_SIZE);

  const threadRows = await db.questionThread.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      curriculumItemId: true,
      user: { select: { name: true } },
    },
  });

  const { replies, earlierByThread } = await loadRecentReplies(threadRows.map((row) => row.id));

  return {
    threads: assembleThreads(threadRows, replies, earlierByThread),
    total,
    page: current,
    pageCount: pageCount(total, THREAD_PAGE_SIZE),
  };
}

async function loadRecentReplies(
  threadIds: string[],
): Promise<{ replies: ReplyRow[]; earlierByThread: Map<string, number> }> {
  if (threadIds.length === 0) return { replies: [], earlierByThread: new Map() };

  const rows = await db.$queryRaw<
    {
      id: string;
      threadId: string;
      body: string;
      createdAt: Date;
      isInstructor: boolean;
      authorName: string;
      replyTotal: number | bigint;
    }[]
  >`
    SELECT ranked.id,
           ranked."threadId" AS "threadId",
           ranked.body,
           ranked."createdAt" AS "createdAt",
           ranked."isInstructor" AS "isInstructor",
           u.name AS "authorName",
           ranked.reply_total AS "replyTotal"
    FROM (
      SELECT r.id,
             r."threadId",
             r.body,
             r."createdAt",
             r."isInstructor",
             r."userId",
             COUNT(*) OVER (PARTITION BY r."threadId") AS reply_total,
             ROW_NUMBER() OVER (PARTITION BY r."threadId" ORDER BY r."createdAt" DESC) AS rn
      FROM thread_replies r
      WHERE r.status = 'VISIBLE'
        AND r."threadId" IN (${Prisma.join(threadIds.map((id) => Prisma.sql`${id}`))})
    ) ranked
    INNER JOIN users u ON u.id = ranked."userId"
    WHERE ranked.rn <= ${REPLY_PAGE_SIZE}
    ORDER BY ranked."createdAt" ASC
  `;

  const shownByThread = new Map<string, number>();
  const totalByThread = new Map<string, number>();
  const replies: ReplyRow[] = [];

  for (const row of rows) {
    totalByThread.set(row.threadId, Number(row.replyTotal));
    shownByThread.set(row.threadId, (shownByThread.get(row.threadId) ?? 0) + 1);
    replies.push({
      id: row.id,
      threadId: row.threadId,
      body: row.body,
      createdAt: row.createdAt,
      isInstructor: row.isInstructor,
      user: { name: row.authorName },
    });
  }

  const earlierByThread = new Map<string, number>();
  for (const [threadId, total] of totalByThread) {
    earlierByThread.set(threadId, Math.max(0, total - (shownByThread.get(threadId) ?? 0)));
  }

  return { replies, earlierByThread };
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
      userId: true,
      title: true,
      courseId: true,
      course: { select: { slug: true, instructorId: true, title: true } },
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

  if (thread.userId !== input.userId) {
    await notify(thread.userId, "qa_reply", {
      title: isInstructor ? "Your instructor replied" : "New reply on your question",
      body: thread.title,
      href: `/learn/${thread.course.slug}`,
    });
  }

  return { ok: true, slug: thread.course.slug };
}

// ---------------------------------------------------------------------------
// Instructor inbox
//
// An instructor teaching several courses otherwise has to open each course's
// player, lecture by lecture, to find out whether anyone is waiting on them.
// These reads answer "what needs me?" across every course they own.
// ---------------------------------------------------------------------------

/**
 * What counts as the instructor having answered: a reply of theirs that is still
 * visible.
 *
 * Defined once and reused by every reader below. It was three separate object
 * literals, and two of them omitted `status`, so a thread whose only instructor
 * reply had been moderated away rendered as "needs an answer" while the filter
 * built to surface exactly those threads excluded it — and the per-course badge
 * undercounted to match. Same shape as the quiz-completion drift in
 * lib/progress.ts: one rule, several dialects, agreeing until they didn't.
 */
const VISIBLE_INSTRUCTOR_REPLY = { isInstructor: true, status: "VISIBLE" } as const;

/** Threads per page in the inbox. An instructor with 5,000 must not render them all. */
export const INBOX_PAGE_SIZE = 20;

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
  page?: string | number;
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
 * as a relation filter over VISIBLE_INSTRUCTOR_REPLY so the
 * database applies it, rather than over-fetching and filtering in memory.
 */
export async function getInstructorInbox(
  instructorId: string,
  filters: InboxFilters = {},
): Promise<InboxPage> {
  const requested = parsePage(filters.page);

  // Ownership is the `where`, not a check afterwards (lib/studio.ts header): a
  // courseId belonging to another instructor narrows this to nothing rather than
  // widening it to their threads.
  const where = {
    status: "VISIBLE" as const,
    course: { instructorId, ...(filters.courseId ? { id: filters.courseId } : {}) },
    ...(filters.unansweredOnly ? { replies: { none: VISIBLE_INSTRUCTOR_REPLY } } : {}),
    ...(filters.since ? { createdAt: { gte: filters.since } } : {}),
  };

  // Count first so an overshot ?page= lands on the last page rather than empty.
  const total = await db.questionThread.count({ where });
  const page = clampPage(requested, total, INBOX_PAGE_SIZE);
  const { skip, take } = skipTake(page, INBOX_PAGE_SIZE);

  const rows = await db.questionThread.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
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
        where: VISIBLE_INSTRUCTOR_REPLY,
        take: 1,
        select: { id: true },
      },
    },
  });

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
    pageCount: pageCount(total, INBOX_PAGE_SIZE),
  };
}

/** Dropdown cap for the inbox course filter. Same bound as studio coupons. */
export const INBOX_COURSE_FILTER_CAP = 200;

export type InboxCourseFilters = {
  courses: { id: string; title: string; unanswered: number }[];
  total: number;
  unansweredTotal: number;
};

/** The courses the inbox filter offers, with how many threads are waiting on each. */
export async function getInboxCourseFilters(instructorId: string): Promise<InboxCourseFilters> {
  const where = { instructorId };
  const unansweredWhere = {
    status: "VISIBLE" as const,
    course: { instructorId },
    replies: { none: VISIBLE_INSTRUCTOR_REPLY },
  };

  const [courses, total, unansweredTotal] = await Promise.all([
    db.course.findMany({
      where,
      orderBy: { title: "asc" },
      take: INBOX_COURSE_FILTER_CAP,
      select: {
        id: true,
        title: true,
        _count: {
          select: {
            threads: {
              where: { status: "VISIBLE", replies: { none: VISIBLE_INSTRUCTOR_REPLY } },
            },
          },
        },
      },
    }),
    db.course.count({ where }),
    db.questionThread.count({ where: unansweredWhere }),
  ]);

  return {
    courses: courses.map((course) => ({
      id: course.id,
      title: course.title,
      unanswered: course._count.threads,
    })),
    total,
    unansweredTotal,
  };
}
