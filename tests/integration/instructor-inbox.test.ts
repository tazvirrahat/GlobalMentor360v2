import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The instructor inbox, driven through the real reads and the real reply action.
 *
 * The two properties worth pinning: an instructor sees only their own courses'
 * threads, and a reply written here is indistinguishable from one written in the
 * player. The second is why the action wraps postReply instead of writing its
 * own row — two writers setting isInstructor differently is exactly the drift
 * invariant 7 exists to prevent, and isInstructor is what marks an answer
 * authoritative.
 */

const hoisted = vi.hoisted(() => ({ actorId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({
    id: hoisted.actorId,
    email: "inbox-actor@example.test",
    name: "Inbox Actor",
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { replyFromInbox } = await import("@/app/studio/qa/actions");
const { getInstructorInbox, askQuestion, postReply } = await import("@/lib/qa");
const { db } = await import("@/lib/db");
const { grantEnrollment } = await import("@/lib/enrollment");

const run = randomUUID().slice(0, 8);
let ownerId: string;
let rivalId: string;
let learnerId: string;
let ownedCourseId: string;
let rivalCourseId: string;
let ownedThreadId: string;
let rivalThreadId: string;

async function makeUser(label: string) {
  return (
    await db.user.create({
      data: { name: `${label} ${run}`, email: `${label}-${run}@example.test` },
      select: { id: true },
    })
  ).id;
}

async function makeCourse(instructorId: string, label: string) {
  return (
    await db.course.create({
      data: {
        title: `${label} ${run}`,
        slug: `${label}-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;
}

beforeAll(async () => {
  ownerId = await makeUser("inbox-owner");
  rivalId = await makeUser("inbox-rival");
  learnerId = await makeUser("inbox-learner");

  ownedCourseId = await makeCourse(ownerId, "inbox-owned");
  rivalCourseId = await makeCourse(rivalId, "inbox-rival-course");

  await grantEnrollment(learnerId, ownedCourseId, "GRANT");
  await grantEnrollment(learnerId, rivalCourseId, "GRANT");

  await askQuestion({
    userId: learnerId,
    courseId: ownedCourseId,
    curriculumItemId: null,
    title: `Owned question ${run}`,
    body: "Asked in the owner's course.",
  });
  await askQuestion({
    userId: learnerId,
    courseId: rivalCourseId,
    curriculumItemId: null,
    title: `Rival question ${run}`,
    body: "Asked in someone else's course.",
  });

  ownedThreadId = (
    await db.questionThread.findFirstOrThrow({
      where: { courseId: ownedCourseId },
      select: { id: true },
    })
  ).id;
  rivalThreadId = (
    await db.questionThread.findFirstOrThrow({
      where: { courseId: rivalCourseId },
      select: { id: true },
    })
  ).id;

  hoisted.actorId = ownerId;
});

afterAll(async () => {
  await db.enrollment.deleteMany({ where: { courseId: { in: [ownedCourseId, rivalCourseId] } } });
  await db.course.deleteMany({ where: { id: { in: [ownedCourseId, rivalCourseId] } } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, rivalId, learnerId] } } });
  await db.$disconnect();
});

describe("getInstructorInbox", () => {
  it("returns only threads on courses this instructor owns", async () => {
    const inbox = await getInstructorInbox(ownerId);
    const ids = inbox.threads.map((thread) => thread.id);

    expect(ids).toContain(ownedThreadId);
    expect(ids).not.toContain(rivalThreadId);
  });

  it("narrows to nothing when given another instructor's courseId", async () => {
    // The filter is applied inside the ownership-scoped where, so a rival's id
    // cannot widen the result — it intersects to empty.
    const inbox = await getInstructorInbox(ownerId, { courseId: rivalCourseId });
    expect(inbox.threads).toHaveLength(0);
  });

  it("counts a learner-only reply as still unanswered", async () => {
    const other = await makeUser("inbox-other-learner");
    await grantEnrollment(other, ownedCourseId, "GRANT");
    await postReply({ userId: other, threadId: ownedThreadId, body: "I think it's X?" });

    // A thread where learners have been guessing still needs the instructor. A
    // reply-count test would call this handled; the instructor-reply test does not.
    const inbox = await getInstructorInbox(ownerId, { unansweredOnly: true });
    expect(inbox.threads.map((t) => t.id)).toContain(ownedThreadId);

    await db.threadReply.deleteMany({ where: { userId: other } });
    await db.enrollment.deleteMany({ where: { userId: other } });
    await db.user.delete({ where: { id: other } });
  });
});

describe("the answered predicate", () => {
  it("agrees with the unanswered filter when an instructor reply is hidden", async () => {
    const thread = await db.questionThread.create({
      data: {
        courseId: ownedCourseId,
        userId: learnerId,
        title: `Hidden-answer thread ${run}`,
        body: "The only instructor reply here was moderated away.",
      },
      select: { id: true },
    });

    await db.threadReply.create({
      data: {
        threadId: thread.id,
        userId: ownerId,
        body: "Moderated answer.",
        isInstructor: true,
        status: "HIDDEN",
      },
    });

    const all = await getInstructorInbox(ownerId);
    const row = all.threads.find((t) => t.id === thread.id);

    // No VISIBLE instructor reply exists, so the list marks it as needing one.
    expect(row?.answered).toBe(false);

    // The filter whose entire purpose is to surface those threads must agree.
    const unanswered = await getInstructorInbox(ownerId, { unansweredOnly: true });
    expect(unanswered.threads.map((t) => t.id)).toContain(thread.id);

    await db.threadReply.deleteMany({ where: { threadId: thread.id } });
    await db.questionThread.delete({ where: { id: thread.id } });
  });
});

describe("replyFromInbox", () => {
  it("writes a reply indistinguishable from one made in the player", async () => {
    const formData = new FormData();
    formData.set("threadId", ownedThreadId);
    formData.set("body", "Answered from the dashboard.");

    const result = await replyFromInbox({ status: "idle" }, formData);
    expect(result.status).toBe("done");

    const reply = await db.threadReply.findFirstOrThrow({
      where: { threadId: ownedThreadId, body: "Answered from the dashboard." },
      select: { isInstructor: true, userId: true },
    });

    // Derived from Course.instructorId by postReply, not passed by this route.
    expect(reply.isInstructor).toBe(true);
    expect(reply.userId).toBe(ownerId);

    const inbox = await getInstructorInbox(ownerId, { unansweredOnly: true });
    expect(inbox.threads.map((t) => t.id)).not.toContain(ownedThreadId);
  });

  it("refuses a thread in a course the actor does not teach", async () => {
    const formData = new FormData();
    formData.set("threadId", rivalThreadId);
    formData.set("body", "Not my course to answer.");

    await replyFromInbox({ status: "idle" }, formData);

    // postReply lets any enrolled learner reply, so the owner — who is not
    // enrolled in the rival's course — must not have written an instructor reply.
    const instructorReplies = await db.threadReply.count({
      where: { threadId: rivalThreadId, userId: ownerId, isInstructor: true },
    });
    expect(instructorReplies).toBe(0);
  });
});
