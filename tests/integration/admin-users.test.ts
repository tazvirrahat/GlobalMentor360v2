import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Suspending signs a person out and is refused for yourself and the last
 * active admin; giving a course goes through grantEnrollment and is audited.
 */

const { db } = await import("@/lib/db");
const { grantCourse, setUserStatus } = await import("@/lib/admin");

const run = randomUUID().slice(0, 8);
let adminId: string;
let learnerId: string;
let publishedId: string;
let draftId: string;

beforeAll(async () => {
  const user = async (label: string) =>
    (await db.user.create({ data: { name: `A ${label} ${run}`, email: `au-${label}-${run}@example.test` }, select: { id: true } })).id;
  [adminId, learnerId] = await Promise.all([user("admin"), user("learner")]);
  await db.userRole.create({ data: { userId: adminId, role: "ADMIN" } });
  publishedId = (
    await db.course.create({
      data: { title: `Au pub ${run}`, slug: `au-pub-${run}`, status: "PUBLISHED", publishedAt: new Date(), instructorId: adminId },
      select: { id: true },
    })
  ).id;
  draftId = (await db.course.create({ data: { title: `Au draft ${run}`, slug: `au-draft-${run}`, instructorId: adminId }, select: { id: true } })).id;
  await db.session.create({ data: { token: `tok-${run}`, userId: learnerId, expiresAt: new Date(Date.now() + 3600_000) } });
});

afterAll(async () => {
  await db.analyticsEvent.deleteMany({ where: { userId: learnerId } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.enrollment.deleteMany({ where: { courseId: { in: [publishedId, draftId] } } });
  await db.course.deleteMany({ where: { id: { in: [publishedId, draftId] } } });
  await db.auditLog.deleteMany({ where: { actorId: adminId } });
  await db.userRole.deleteMany({ where: { userId: adminId } });
  await db.user.deleteMany({ where: { id: { in: [adminId, learnerId] } } });
  await db.$disconnect();
});

describe("setUserStatus", () => {
  it("refuses suspending yourself", async () => {
    expect(await setUserStatus(adminId, adminId, "SUSPENDED")).toEqual({ ok: false, message: "You cannot suspend your own account." });
  });

  it("suspends someone, signing them out, and audits it", async () => {
    expect(await setUserStatus(adminId, learnerId, "SUSPENDED")).toEqual({ ok: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: learnerId }, select: { status: true } })).status).toBe("SUSPENDED");
    expect(await db.session.count({ where: { userId: learnerId } })).toBe(0);
    expect(await db.auditLog.count({ where: { actorId: adminId, action: "user.suspend", targetId: learnerId } })).toBe(1);
  });

  it("restores them", async () => {
    expect(await setUserStatus(adminId, learnerId, "ACTIVE")).toEqual({ ok: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: learnerId }, select: { status: true } })).status).toBe("ACTIVE");
    expect(await db.auditLog.count({ where: { actorId: adminId, action: "user.unsuspend", targetId: learnerId } })).toBe(1);
  });
});

describe("grantCourse", () => {
  it("only gives published courses", async () => {
    expect(await grantCourse(adminId, learnerId, draftId)).toEqual({ ok: false, message: "Only a published course can be given." });
  });

  it("opens the course as a GRANT and audits it, once", async () => {
    expect(await grantCourse(adminId, learnerId, publishedId)).toEqual({ ok: true });
    const enrollment = await db.enrollment.findUniqueOrThrow({
      where: { userId_courseId: { userId: learnerId, courseId: publishedId } },
      select: { source: true, revokedAt: true },
    });
    expect(enrollment).toEqual({ source: "GRANT", revokedAt: null });
    expect(await db.auditLog.count({ where: { actorId: adminId, action: "enrollment.grant", targetId: publishedId } })).toBe(1);
    expect(await grantCourse(adminId, learnerId, publishedId)).toEqual({ ok: false, message: "They already have this course." });
  });
});
