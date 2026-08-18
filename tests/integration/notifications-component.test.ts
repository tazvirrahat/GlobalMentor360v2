import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Each notification type is created on its real trigger. sendEmail is mocked so
 * this file never contacts SES (announcements and receipts would otherwise).
 */

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { db } = await import("@/lib/db");
const { grantEnrollment, revokeEnrollment } = await import("@/lib/enrollment");
const { askQuestion, postReply } = await import("@/lib/qa");
const { sendAnnouncement } = await import("@/lib/announcements");
const { sendPaymentReceipt } = await import("@/lib/receipts");
const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = await import("@/lib/notifications");

const run = randomUUID().slice(0, 8);

let instructorId: string;
let learnerId: string;
let otherLearnerId: string;
let refundedId: string;
let courseId: string;
let slug: string;
const extraUserIds: string[] = [];

async function makeUser(label: string) {
  return (
    await db.user.create({
      data: { name: `${label} ${run}`, email: `${label}-${run}@example.test` },
      select: { id: true },
    })
  ).id;
}

beforeAll(async () => {
  instructorId = await makeUser("notif-instructor");
  learnerId = await makeUser("notif-learner");
  otherLearnerId = await makeUser("notif-other");
  refundedId = await makeUser("notif-refunded");

  slug = `notif-course-${run}`;
  courseId = (
    await db.course.create({
      data: {
        title: `Notif Course ${run}`,
        slug,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;

  await grantEnrollment(learnerId, courseId, "GRANT");
  await grantEnrollment(otherLearnerId, courseId, "GRANT");
  await grantEnrollment(refundedId, courseId, "PURCHASE");
  await revokeEnrollment(refundedId, courseId);
});

afterAll(async () => {
  const userIds = [instructorId, learnerId, otherLearnerId, refundedId, ...extraUserIds];
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.analyticsEvent.deleteMany({ where: { userId: { in: userIds } } });
  await db.threadReply.deleteMany({ where: { userId: { in: userIds } } });
  await db.questionThread.deleteMany({ where: { courseId } });
  await db.payment.deleteMany({ where: { userId: { in: userIds } } });
  await db.order.deleteMany({ where: { userId: { in: userIds } } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.announcement.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.notification.deleteMany({
    where: { userId: { in: [instructorId, learnerId, otherLearnerId, refundedId, ...extraUserIds] } },
  });
});

describe("enrollment notification", () => {
  it("notifies the learner who was just enrolled, and only them", async () => {
    const newbieId = await makeUser("notif-newbie");
    extraUserIds.push(newbieId);

    await grantEnrollment(newbieId, courseId, "GRANT");

    const newbie = await listNotifications(newbieId);
    expect(newbie.items).toEqual([
      expect.objectContaining({
        type: "enrollment",
        payload: expect.objectContaining({
          title: "You're enrolled",
          body: `Notif Course ${run}`,
          href: `/learn/${slug}`,
        }),
      }),
    ]);

    const instructor = await listNotifications(instructorId);
    expect(instructor.items).toHaveLength(0);
  });

  it("does not notify again when the same grant is retried", async () => {
    await grantEnrollment(learnerId, courseId, "GRANT");
    const { items } = await listNotifications(learnerId);
    expect(items.filter((n) => n.type === "enrollment")).toHaveLength(0);
  });
});

describe("Q&A reply notification", () => {
  it("notifies the question author when someone else replies, not the replier", async () => {
    const asked = await askQuestion({
      userId: learnerId,
      courseId,
      curriculumItemId: null,
      title: `Why does this fail ${run}?`,
      body: "The example compiles but the output differs.",
    });
    expect(asked.ok).toBe(true);

    const thread = await db.questionThread.findFirstOrThrow({
      where: { courseId, userId: learnerId, title: `Why does this fail ${run}?` },
      select: { id: true },
    });

    const replied = await postReply({
      userId: instructorId,
      threadId: thread.id,
      body: "Because the fixture uses a different locale.",
    });
    expect(replied.ok).toBe(true);

    const author = await listNotifications(learnerId);
    expect(author.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "qa_reply",
          payload: expect.objectContaining({
            title: "Your instructor replied",
            href: `/learn/${slug}`,
          }),
        }),
      ]),
    );

    const replier = await listNotifications(instructorId);
    expect(replier.items.filter((n) => n.type === "qa_reply")).toHaveLength(0);
  });

  it("does not notify the author for their own reply", async () => {
    const asked = await askQuestion({
      userId: learnerId,
      courseId,
      curriculumItemId: null,
      title: `Follow-up ${run}`,
      body: "Adding more detail.",
    });
    expect(asked.ok).toBe(true);

    const thread = await db.questionThread.findFirstOrThrow({
      where: { courseId, userId: learnerId, title: `Follow-up ${run}` },
      select: { id: true },
    });

    await postReply({ userId: learnerId, threadId: thread.id, body: "I figured it out." });

    const author = await listNotifications(learnerId);
    expect(author.items.filter((n) => n.type === "qa_reply")).toHaveLength(0);
  });
});

describe("announcement notification", () => {
  it("notifies live enrollments only — not the refunded learner or the instructor", async () => {
    const result = await sendAnnouncement({
      instructorId,
      courseId,
      subject: `Section 4 is live ${run}`,
      body: "New material on generics.",
    });
    expect(result.ok).toBe(true);

    expect((await listNotifications(learnerId)).items.some((n) => n.type === "announcement")).toBe(
      true,
    );
    expect(
      (await listNotifications(otherLearnerId)).items.some((n) => n.type === "announcement"),
    ).toBe(true);
    expect(
      (await listNotifications(refundedId)).items.filter((n) => n.type === "announcement"),
    ).toHaveLength(0);
    expect(
      (await listNotifications(instructorId)).items.filter((n) => n.type === "announcement"),
    ).toHaveLength(0);
  });
});

describe("payment notification", () => {
  it("notifies the buyer when a receipt is sent, not another learner", async () => {
    const order = await db.order.create({
      data: {
        userId: learnerId,
        status: "PAID",
        currency: "BDT",
        subtotal: 500000,
        total: 500000,
        items: { create: { courseId, unitPrice: 500000 } },
        payments: {
          create: {
            userId: learnerId,
            method: "STRIPE",
            status: "COMPLETED",
            amount: 500000,
            currency: "BDT",
            stripePaymentIntentId: `pi_notif_${run}`,
            paidAt: new Date(),
          },
        },
      },
      select: { id: true },
    });

    await sendPaymentReceipt(order.id);

    expect((await listNotifications(learnerId)).items.some((n) => n.type === "payment")).toBe(true);
    expect(
      (await listNotifications(otherLearnerId)).items.filter((n) => n.type === "payment"),
    ).toHaveLength(0);
  });
});

describe("read / unread", () => {
  it("counts unread, marks one, then marks the rest", async () => {
    await db.notification.createMany({
      data: [
        {
          userId: learnerId,
          type: "enrollment",
          payload: { title: "A", body: "A", href: "/learn/a" },
        },
        {
          userId: learnerId,
          type: "announcement",
          payload: { title: "B", body: "B", href: "/learn/b" },
        },
      ],
    });

    const before = await listNotifications(learnerId);
    expect(before.unreadCount).toBe(2);

    await markNotificationRead(learnerId, before.items[0]!.id);
    expect((await listNotifications(learnerId)).unreadCount).toBe(1);

    await markAllNotificationsRead(learnerId);
    const afterAll = await listNotifications(learnerId);
    expect(afterAll.unreadCount).toBe(0);
    expect(afterAll.items.every((n) => n.readAt !== null)).toBe(true);
  });

  it("cannot mark another user's notification as read", async () => {
    const row = await db.notification.create({
      data: {
        userId: otherLearnerId,
        type: "enrollment",
        payload: { title: "Theirs", body: "Theirs", href: "/learn/x" },
      },
      select: { id: true },
    });

    await markNotificationRead(learnerId, row.id);

    const theirs = await listNotifications(otherLearnerId);
    expect(theirs.unreadCount).toBe(1);
    expect(theirs.items[0]?.readAt).toBeNull();
  });
});
