import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Drag reorder writes the whole new order at once: only the course's owner,
 * and only when the ids are exactly the rows that are there now.
 */

const hoisted = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({ id: hoisted.userId, email: "reorder@example.test", name: "Reorder" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { reorderItems, reorderSections } = await import("@/app/(app)/studio/curriculum-actions");
const { db } = await import("@/lib/db");

const run = randomUUID().slice(0, 8);
let ownerId: string;
let otherId: string;
let courseId: string;
const sectionIds: string[] = [];
const itemIds: string[] = [];

beforeAll(async () => {
  const user = async (label: string) =>
    (await db.user.create({ data: { name: `R ${label} ${run}`, email: `ro-${label}-${run}@example.test` }, select: { id: true } })).id;
  [ownerId, otherId] = await Promise.all([user("owner"), user("other")]);
  courseId = (await db.course.create({ data: { title: `Ro ${run}`, slug: `ro-${run}`, instructorId: ownerId }, select: { id: true } })).id;
  for (const position of [0, 1, 2]) {
    sectionIds.push((await db.section.create({ data: { courseId, title: `S${position}`, position }, select: { id: true } })).id);
  }
  for (const position of [0, 1, 2]) {
    itemIds.push(
      (
        await db.curriculumItem.create({
          data: { sectionId: sectionIds[0]!, title: `I${position}`, type: "LECTURE", position, lecture: { create: { contentType: "ARTICLE" } } },
          select: { id: true },
        })
      ).id,
    );
  }
});

afterAll(async () => {
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
  await db.$disconnect();
});

async function sectionOrder() {
  return (await db.section.findMany({ where: { courseId }, orderBy: { position: "asc" }, select: { title: true } })).map((row) => row.title);
}

async function itemOrder() {
  return (
    await db.curriculumItem.findMany({ where: { sectionId: sectionIds[0] }, orderBy: { position: "asc" }, select: { title: true, position: true } })
  ).map((row) => `${row.title}@${row.position}`);
}

describe("reorderSections", () => {
  it("writes the new order for the owner", async () => {
    hoisted.userId = ownerId;
    const [a, b, c] = sectionIds as [string, string, string];
    expect(await reorderSections({ courseId, ids: [c, a, b] })).toEqual({ status: "done", message: "Moved." });
    expect(await sectionOrder()).toEqual(["S2", "S0", "S1"]);
  });

  it("refuses anyone else", async () => {
    hoisted.userId = otherId;
    expect((await reorderSections({ courseId, ids: [...sectionIds] })).status).toBe("error");
    expect(await sectionOrder()).toEqual(["S2", "S0", "S1"]);
  });

  it("refuses a stale or doctored list", async () => {
    hoisted.userId = ownerId;
    const [a, b, c] = sectionIds as [string, string, string];
    expect((await reorderSections({ courseId, ids: [a, b] })).status).toBe("error");
    expect((await reorderSections({ courseId, ids: [a, a, b] })).status).toBe("error");
    expect((await reorderSections({ courseId, ids: [a, b, c, randomUUID()] })).status).toBe("error");
    expect(await sectionOrder()).toEqual(["S2", "S0", "S1"]);
  });
});

describe("reorderItems", () => {
  it("writes positions 0 to n-1 in the new order", async () => {
    hoisted.userId = ownerId;
    const [a, b, c] = itemIds as [string, string, string];
    expect(await reorderItems({ sectionId: sectionIds[0]!, ids: [b, c, a] })).toEqual({ status: "done", message: "Moved." });
    expect(await itemOrder()).toEqual(["I1@0", "I2@1", "I0@2"]);
  });

  it("refuses items from another section and other people", async () => {
    hoisted.userId = ownerId;
    expect((await reorderItems({ sectionId: sectionIds[1]!, ids: [...itemIds] })).status).toBe("error");
    hoisted.userId = otherId;
    expect((await reorderItems({ sectionId: sectionIds[0]!, ids: [...itemIds] })).status).toBe("error");
    expect(await itemOrder()).toEqual(["I1@0", "I2@1", "I0@2"]);
  });
});
