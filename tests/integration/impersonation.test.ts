import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Read-only "view as": who may start it, that the grant only works for the
 * admin who holds it while every rule still holds, and the audit trail.
 */

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-for-view-as";
const { db } = await import("@/lib/db");
const { canViewAs, resolveViewAs, startViewAs, stopViewAs } = await import("@/lib/impersonation");

const run = randomUUID().slice(0, 8);
let adminId: string;
let otherAdminId: string;
let learnerId: string;
let suspendedId: string;

beforeAll(async () => {
  const user = async (label: string, data: Record<string, unknown> = {}) =>
    (await db.user.create({ data: { name: `V ${label} ${run}`, email: `va-${label}-${run}@example.test`, ...data }, select: { id: true } })).id;
  adminId = await user("admin");
  otherAdminId = await user("admin2");
  learnerId = await user("learner");
  suspendedId = await user("suspended", { status: "SUSPENDED" });
  await db.userRole.createMany({ data: [{ userId: adminId, role: "ADMIN" }, { userId: otherAdminId, role: "ADMIN" }] });
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: { in: [adminId, otherAdminId] } } });
  await db.userRole.deleteMany({ where: { userId: { in: [adminId, otherAdminId] } } });
  await db.user.deleteMany({ where: { id: { in: [adminId, otherAdminId, learnerId, suspendedId] } } });
  await db.$disconnect();
});

describe("canViewAs", () => {
  it("refuses yourself, admins, suspended accounts, and non-admins doing it", async () => {
    expect((await canViewAs(adminId, adminId)).ok).toBe(false);
    expect(await canViewAs(adminId, otherAdminId)).toEqual({ ok: false, message: "Admins can't be viewed as." });
    expect(await canViewAs(adminId, suspendedId)).toEqual({ ok: false, message: "A suspended account can't be viewed as." });
    expect(await canViewAs(learnerId, suspendedId)).toEqual({ ok: false, message: "Only admins can do this." });
    expect((await canViewAs(adminId, learnerId)).ok).toBe(true);
  });
});

describe("the grant", () => {
  let cookie = "";

  it("starts for 30 minutes and is audited", async () => {
    const started = await startViewAs(adminId, learnerId, Date.now());
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    cookie = started.cookie;
    expect(started.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    expect(await db.auditLog.count({ where: { actorId: adminId, action: "impersonation.start", targetId: learnerId } })).toBe(1);
  });

  it("shows the site as the learner only to the admin who holds it", async () => {
    expect((await resolveViewAs(adminId, cookie))?.target.id).toBe(learnerId);
    expect(await resolveViewAs(otherAdminId, cookie)).toBeNull();
    expect(await resolveViewAs(adminId, `${cookie}x`)).toBeNull();
    expect(await resolveViewAs(adminId, cookie, Date.now() + 31 * 60 * 1000)).toBeNull();
  });

  it("stops working when the learner is suspended or the admin loses the role", async () => {
    await db.user.update({ where: { id: learnerId }, data: { status: "SUSPENDED" } });
    expect(await resolveViewAs(adminId, cookie)).toBeNull();
    await db.user.update({ where: { id: learnerId }, data: { status: "ACTIVE" } });

    await db.userRole.deleteMany({ where: { userId: adminId, role: "ADMIN" } });
    expect(await resolveViewAs(adminId, cookie)).toBeNull();
    await db.userRole.create({ data: { userId: adminId, role: "ADMIN" } });
    expect((await resolveViewAs(adminId, cookie))?.target.id).toBe(learnerId);
  });

  it("records the stop, only for the admin who holds it", async () => {
    expect(await stopViewAs(otherAdminId, cookie)).toBeNull();
    expect(await stopViewAs(adminId, cookie)).toBe(learnerId);
    expect(await db.auditLog.count({ where: { actorId: adminId, action: "impersonation.stop", targetId: learnerId } })).toBe(1);
  });
});
