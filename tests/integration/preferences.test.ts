import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** The account page's switches: reply notifications, and announcements in the app and by email. */

const sent = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  sendEmail: async (message: { to: string }) => {
    sent.to.push(message.to);
  },
}));

const { db } = await import("@/lib/db");
const { notify } = await import("@/lib/notifications");
const { sendAnnouncement } = await import("@/lib/announcements");

const run = randomUUID().slice(0, 8);
let instructorId: string;
let quietId: string;
let chattyId: string;
let courseId: string;
const email = (label: string) => `pref-${label}-${run}@example.test`;

beforeAll(async () => {
  const user = async (label: string, data: Record<string, boolean> = {}) =>
    (await db.user.create({ data: { name: `P ${label} ${run}`, email: email(label), ...data }, select: { id: true } })).id;
  instructorId = await user("teacher");
  quietId = await user("quiet", { notifyAnnouncements: false, emailAnnouncements: false, notifyQaReplies: false, notifyReviewReplies: false });
  chattyId = await user("chatty");
  courseId = (
    await db.course.create({
      data: { title: `Pref ${run}`, slug: `pref-${run}`, status: "PUBLISHED", publishedAt: new Date(), instructorId },
      select: { id: true },
    })
  ).id;
  for (const userId of [quietId, chattyId]) await db.enrollment.create({ data: { userId, courseId, source: "GRANT" } });
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { userId: { in: [quietId, chattyId] } } });
  await db.announcement.deleteMany({ where: { courseId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [instructorId, quietId, chattyId] } } });
  await db.$disconnect();
});

const count = (userId: string, type: string) => db.notification.count({ where: { userId, type } });

describe("reply notifications", () => {
  it("skip people who turned them off", async () => {
    for (const type of ["qa_reply", "review_reply"] as const) {
      await notify(quietId, type, { title: "t", body: "b", href: "/" });
      await notify(chattyId, type, { title: "t", body: "b", href: "/" });
      expect(await count(quietId, type)).toBe(0);
      expect(await count(chattyId, type)).toBe(1);
    }
  });

  it("never switch off enrollments", async () => {
    await notify(quietId, "enrollment", { title: "t", body: "b", href: "/" });
    expect(await count(quietId, "enrollment")).toBe(1);
  });
});

describe("announcements", () => {
  it("reach the bell and the inbox only for those who want them", async () => {
    const result = await sendAnnouncement({ instructorId, courseId, subject: "Week 2 is up", body: "New lessons." });
    expect(result.ok).toBe(true);
    expect(await count(chattyId, "announcement")).toBe(1);
    expect(await count(quietId, "announcement")).toBe(0);
    expect(sent.to).toContain(email("chatty"));
    expect(sent.to).not.toContain(email("quiet"));
  });
});
