import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Course Q&A, driven through the real server actions against a real Postgres.
 *
 * These actions are POST endpoints. Everything they refuse, they have to refuse
 * without help from the page that renders the form, so every case below skips
 * the UI entirely and posts FormData — which is what an attacker has too.
 *
 * The cases that matter are the ones where the request looks well-formed:
 *   - a learner whose enrollment was revoked (a refund) still holds a session
 *     and a rendered form;
 *   - a crafted post pairing this course's id with another course's lecture is
 *     valid zod and valid foreign keys, and is only wrong relationally;
 *   - `isInstructor` is what the UI attributes an answer to, and nothing in the
 *     form says who is answering.
 */

const hoisted = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () =>
    hoisted.userId ? { id: hoisted.userId, email: "qa@example.test", name: "Q&A User" } : null,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { askQuestionAction, replyAction } = await import("@/app/learn/[slug]/qa-actions");
const { getCourseQaPanel } = await import("@/lib/qa");
const { db } = await import("@/lib/db");
const { grantEnrollment, revokeEnrollment } = await import("@/lib/enrollment");

const run = randomUUID().slice(0, 8);

let instructorId: string;
let otherInstructorId: string;
let learnerId: string;
let outsiderId: string;
let refundedId: string;

let courseId: string;
let otherCourseId: string;
let itemId: string;
let secondItemId: string;
let otherCourseItemId: string;

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [key, value] of Object.entries(entries)) f.set(key, value);
  return f;
}

/** What the ask form posts, with per-test overrides. */
const askForm = (overrides: Record<string, string> = {}) =>
  form({
    courseId,
    curriculumItemId: itemId,
    scope: "LECTURE",
    title: `Question ${randomUUID().slice(0, 8)}`,
    body: "The example compiles for me but the output differs. What am I missing?",
    ...overrides,
  });

async function makeUser(label: string) {
  const user = await db.user.create({
    data: { name: `QA ${label} ${run}`, email: `qa-${label}-${run}@example.test` },
    select: { id: true },
  });
  return user.id;
}

async function makeCourse(ownerId: string, label: string) {
  const course = await db.course.create({
    data: {
      title: `QA Course ${label} ${run}`,
      slug: `qa-course-${label}-${run}`,
      status: "PUBLISHED",
      instructorId: ownerId,
      publishedAt: new Date(),
      sections: {
        create: {
          title: "Section 1",
          position: 0,
          items: {
            create: [
              { title: "Lecture 1", type: "LECTURE", position: 0 },
              { title: "Lecture 2", type: "LECTURE", position: 1 },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      sections: { select: { items: { orderBy: { position: "asc" }, select: { id: true } } } },
    },
  });

  const items = course.sections[0]!.items;
  return { id: course.id, itemIds: items.map((item) => item.id) };
}

beforeAll(async () => {
  [instructorId, otherInstructorId, learnerId, outsiderId, refundedId] = await Promise.all([
    makeUser("instructor"),
    makeUser("other-instructor"),
    makeUser("learner"),
    makeUser("outsider"),
    makeUser("refunded"),
  ]) as [string, string, string, string, string];

  const course = await makeCourse(instructorId, "main");
  courseId = course.id;
  [itemId, secondItemId] = course.itemIds as [string, string];

  const other = await makeCourse(otherInstructorId, "other");
  otherCourseId = other.id;
  otherCourseItemId = other.itemIds[0]!;

  await grantEnrollment(learnerId, courseId, "GRANT");

  // A learner who bought, then was refunded: the row survives with revokedAt set,
  // which is exactly the state invariant 1 says must not grant access.
  await grantEnrollment(refundedId, courseId, "PURCHASE");
  await revokeEnrollment(refundedId, courseId);
});

afterAll(async () => {
  await db.enrollment.deleteMany({ where: { courseId: { in: [courseId, otherCourseId] } } });
  await db.course.deleteMany({ where: { id: { in: [courseId, otherCourseId] } } });
  await db.user.deleteMany({
    where: { id: { in: [instructorId, otherInstructorId, learnerId, outsiderId, refundedId] } },
  });
  await db.$disconnect();
});

describe("askQuestionAction", () => {
  it("lets an enrolled learner open a thread on the lecture they are watching", async () => {
    hoisted.userId = learnerId;
    const title = `Enrolled ask ${run}`;

    const result = await askQuestionAction({ status: "idle" }, askForm({ title }));
    expect(result.status).toBe("posted");

    const thread = await db.questionThread.findFirstOrThrow({
      where: { courseId, title },
      select: { curriculumItemId: true, userId: true, status: true, upvotes: true },
    });

    expect(thread.curriculumItemId).toBe(itemId);
    expect(thread.userId).toBe(learnerId);
    expect(thread.status).toBe("VISIBLE");
    expect(thread.upvotes).toBe(0);
  });

  it("files a COURSE thread against no lecture at all", async () => {
    hoisted.userId = learnerId;
    const title = `Course-wide ask ${run}`;

    const result = await askQuestionAction(
      { status: "idle" },
      // The player still posts the lecture it is showing; the scope is what
      // decides whether the write uses it.
      askForm({ title, scope: "COURSE" }),
    );
    expect(result.status).toBe("posted");

    const thread = await db.questionThread.findFirstOrThrow({
      where: { courseId, title },
      select: { curriculumItemId: true },
    });
    expect(thread.curriculumItemId).toBeNull();
  });

  it("refuses someone who was never enrolled", async () => {
    hoisted.userId = outsiderId;
    const title = `Outsider ask ${run}`;

    const result = await askQuestionAction({ status: "idle" }, askForm({ title }));

    expect(result.status).toBe("error");
    expect(await db.questionThread.count({ where: { courseId, title } })).toBe(0);
  });

  it("refuses a learner whose enrollment was revoked", async () => {
    hoisted.userId = refundedId;
    const title = `Refunded ask ${run}`;

    const result = await askQuestionAction({ status: "idle" }, askForm({ title }));

    expect(result.status).toBe("error");
    // The enrollment row is still there — only revokedAt tells the two apart, and
    // that is the whole of invariant 1.
    expect(
      await db.enrollment.count({ where: { userId: refundedId, courseId } }),
    ).toBe(1);
    expect(await db.questionThread.count({ where: { courseId, title } })).toBe(0);
  });

  it("refuses a signed-out caller", async () => {
    hoisted.userId = "";
    const title = `Anonymous ask ${run}`;

    const result = await askQuestionAction({ status: "idle" }, askForm({ title }));

    expect(result.status).toBe("error");
    expect(await db.questionThread.count({ where: { courseId, title } })).toBe(0);
  });

  it("refuses a lecture that belongs to a different course", async () => {
    hoisted.userId = learnerId;
    const title = `Crafted pair ${run}`;

    // Both ids exist and both foreign keys would resolve. Only the relationship
    // between them is wrong, which is why the pairing lives in the `where`.
    const result = await askQuestionAction(
      { status: "idle" },
      askForm({ title, curriculumItemId: otherCourseItemId }),
    );

    expect(result.status).toBe("error");
    expect(await db.questionThread.count({ where: { title } })).toBe(0);
  });

  it("refuses a LECTURE question with no lecture rather than filing it course-wide", async () => {
    hoisted.userId = learnerId;
    const title = `Scopeless ask ${run}`;

    const result = await askQuestionAction(
      { status: "idle" },
      askForm({ title, curriculumItemId: "" }),
    );

    expect(result.status).toBe("error");
    expect(await db.questionThread.count({ where: { courseId, title } })).toBe(0);
  });
});

describe("replyAction", () => {
  let threadId: string;

  beforeAll(async () => {
    hoisted.userId = learnerId;
    const title = `Thread to answer ${run}`;
    await askQuestionAction({ status: "idle" }, askForm({ title }));
    threadId = (
      await db.questionThread.findFirstOrThrow({ where: { courseId, title }, select: { id: true } })
    ).id;
  });

  it("marks the course's instructor as the instructor", async () => {
    hoisted.userId = instructorId;

    const result = await replyAction(
      { status: "idle" },
      // Nothing in this form claims a role.
      form({ threadId, body: `Instructor answer ${run}` }),
    );
    expect(result.status).toBe("posted");

    const reply = await db.threadReply.findFirstOrThrow({
      where: { threadId, userId: instructorId },
      select: { isInstructor: true },
    });
    expect(reply.isInstructor).toBe(true);
  });

  it("lets the instructor answer without being enrolled in their own course", async () => {
    // The reply above already proves the write went through; this states why it
    // is allowed to, because an instructor holds no enrollment row.
    expect(await db.enrollment.count({ where: { userId: instructorId, courseId } })).toBe(0);
  });

  it("does not mark an enrolled learner as the instructor", async () => {
    hoisted.userId = learnerId;

    const result = await replyAction(
      { status: "idle" },
      form({ threadId, body: `Learner answer ${run}` }),
    );
    expect(result.status).toBe("posted");

    const reply = await db.threadReply.findFirstOrThrow({
      where: { threadId, userId: learnerId },
      select: { isInstructor: true },
    });
    expect(reply.isInstructor).toBe(false);
  });

  it("refuses another course's instructor", async () => {
    // Being *an* instructor is not being *this course's* instructor, and the
    // check compares against Course.instructorId rather than a role.
    hoisted.userId = otherInstructorId;

    const result = await replyAction(
      { status: "idle" },
      form({ threadId, body: `Wrong instructor ${run}` }),
    );

    expect(result.status).toBe("error");
    expect(await db.threadReply.count({ where: { threadId, userId: otherInstructorId } })).toBe(0);
  });

  it("refuses a learner whose enrollment was revoked", async () => {
    hoisted.userId = refundedId;

    const result = await replyAction(
      { status: "idle" },
      form({ threadId, body: `Refunded answer ${run}` }),
    );

    expect(result.status).toBe("error");
    expect(await db.threadReply.count({ where: { threadId, userId: refundedId } })).toBe(0);
  });

  it("refuses someone who was never enrolled", async () => {
    hoisted.userId = outsiderId;

    const result = await replyAction(
      { status: "idle" },
      form({ threadId, body: `Outsider answer ${run}` }),
    );

    expect(result.status).toBe("error");
    expect(await db.threadReply.count({ where: { threadId, userId: outsiderId } })).toBe(0);
  });
});

describe("getCourseQaPanel", () => {
  it("lists this lecture's threads and the course-wide ones, and nothing else", async () => {
    hoisted.userId = learnerId;

    const here = `Panel here ${run}`;
    const courseWide = `Panel course-wide ${run}`;
    const elsewhere = `Panel elsewhere ${run}`;

    await askQuestionAction({ status: "idle" }, askForm({ title: here }));
    await askQuestionAction({ status: "idle" }, askForm({ title: courseWide, scope: "COURSE" }));
    await askQuestionAction(
      { status: "idle" },
      askForm({ title: elsewhere, curriculumItemId: secondItemId }),
    );

    const panel = await getCourseQaPanel(courseId, itemId);
    const titles = panel.threads.map((thread) => thread.title);

    expect(titles).toContain(here);
    expect(titles).toContain(courseWide);
    // The second lecture's thread belongs on the second lecture's page.
    expect(titles).not.toContain(elsewhere);

    expect(panel.threads.find((t) => t.title === courseWide)?.scope).toBe("COURSE");
    expect(panel.threads.find((t) => t.title === here)?.scope).toBe("LECTURE");
  });

  it("carries replies with their author and instructor flag", async () => {
    hoisted.userId = learnerId;
    const title = `Panel replies ${run}`;
    await askQuestionAction({ status: "idle" }, askForm({ title }));
    const threadId = (
      await db.questionThread.findFirstOrThrow({ where: { courseId, title }, select: { id: true } })
    ).id;

    hoisted.userId = instructorId;
    await replyAction({ status: "idle" }, form({ threadId, body: "Answered." }));

    const panel = await getCourseQaPanel(courseId, itemId);
    const thread = panel.threads.find((t) => t.id === threadId);

    expect(thread?.replies).toHaveLength(1);
    expect(thread?.replies[0]?.isInstructor).toBe(true);
    expect(thread?.replies[0]?.authorName).toBe(`QA instructor ${run}`);
  });

  it("hides a moderated thread from the list", async () => {
    hoisted.userId = learnerId;
    const title = `Panel hidden ${run}`;
    await askQuestionAction({ status: "idle" }, askForm({ title }));
    await db.questionThread.updateMany({ where: { courseId, title }, data: { status: "HIDDEN" } });

    const panel = await getCourseQaPanel(courseId, itemId);
    expect(panel.threads.map((t) => t.title)).not.toContain(title);
  });

  it("does not leak another course's threads", async () => {
    const panel = await getCourseQaPanel(otherCourseId, otherCourseItemId);
    expect(panel.threads).toHaveLength(0);
  });
});
