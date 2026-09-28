import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Featured courses lead the home page's list, newest feature first; drafts never show. */

const { db } = await import("@/lib/db");
const { setCourseFeatured } = await import("@/lib/admin");
const { listHomeCourses } = await import("@/lib/courses");

const run = randomUUID().slice(0, 8);
let adminId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  adminId = (await db.user.create({ data: { name: `F ${run}`, email: `feat-${run}@example.test` }, select: { id: true } })).id;
  for (const [label, published] of [["older", true], ["newer", true], ["draft", false]] as const) {
    ids[label] = (
      await db.course.create({
        data: {
          title: `Feat ${label} ${run}`,
          slug: `feat-${label}-${run}`,
          instructorId: adminId,
          ...(published ? { status: "PUBLISHED" as const, publishedAt: new Date() } : {}),
        },
        select: { id: true },
      })
    ).id;
  }
});

afterAll(async () => {
  await db.course.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await db.auditLog.deleteMany({ where: { actorId: adminId } });
  await db.user.deleteMany({ where: { id: adminId } });
  await db.$disconnect();
});

describe("featuring", () => {
  it("refuses a draft", async () => {
    expect(await setCourseFeatured(adminId, ids.draft!, true)).toEqual({ ok: false, message: "Only a published course can be featured." });
  });

  it("puts featured courses first, newest feature first, and audits it", async () => {
    expect(await setCourseFeatured(adminId, ids.older!, true)).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await setCourseFeatured(adminId, ids.newer!, true)).toEqual({ ok: true });
    const list = await listHomeCourses(6);
    expect(list.slice(0, 2).map((course) => course.id)).toEqual([ids.newer, ids.older]);
    expect(new Set(list.map((course) => course.id)).size).toBe(list.length);
    expect(await db.auditLog.count({ where: { actorId: adminId, action: "course.feature" } })).toBe(2);
  });

  it("drops a course from the lead once it is unpublished or unfeatured", async () => {
    await db.course.update({ where: { id: ids.newer }, data: { status: "UNPUBLISHED" } });
    expect((await listHomeCourses(6))[0]?.id).toBe(ids.older);
    expect(await setCourseFeatured(adminId, ids.older!, false)).toEqual({ ok: true });
    expect((await listHomeCourses(6)).slice(0, 1).map((course) => course.id)).not.toContain(ids.older);
  });
});
