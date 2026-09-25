import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The taxonomy editor's rules: two-level categories with unique names among
 * siblings, slugs that survive a rename, categories in use kept, topic and
 * skill deletes taking their course links with them, and every write audited.
 */

const { db } = await import("@/lib/db");
const taxonomy = await import("@/lib/taxonomy");
const { listPublishedCourses } = await import("@/lib/courses");

const run = randomUUID().slice(0, 8);
const name = (label: string) => `${label} ${run}`;
let adminId: string;
let courseId: string;

async function category(label: string) {
  return db.category.findFirstOrThrow({ where: { name: name(label) }, select: { id: true, slug: true, position: true, parentId: true } });
}

beforeAll(async () => {
  adminId = (await db.user.create({ data: { name: `Tax ${run}`, email: `tax-${run}@example.test` }, select: { id: true } })).id;
  courseId = (
    await db.course.create({
      data: { title: `Tax course ${run}`, slug: `tax-course-${run}`, status: "PUBLISHED", publishedAt: new Date(), instructorId: adminId },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await db.course.deleteMany({ where: { id: courseId } });
  await db.category.deleteMany({ where: { name: { endsWith: run }, parentId: { not: null } } });
  await db.category.deleteMany({ where: { name: { endsWith: run } } });
  await db.topic.deleteMany({ where: { name: { endsWith: run } } });
  await db.skill.deleteMany({ where: { name: { endsWith: run } } });
  await db.auditLog.deleteMany({ where: { actorId: adminId } });
  await db.user.deleteMany({ where: { id: adminId } });
  await db.$disconnect();
});

describe("categories", () => {
  it("adds subjects and subcategories, two levels deep", async () => {
    expect(await taxonomy.createCategory(adminId, { name: name("Science"), parentId: null })).toEqual({ ok: true });
    const science = await category("Science");
    expect(await taxonomy.createCategory(adminId, { name: name("Physics"), parentId: science.id })).toEqual({ ok: true });
    const physics = await category("Physics");
    expect(physics.parentId).toBe(science.id);

    const third = await taxonomy.createCategory(adminId, { name: name("Optics"), parentId: physics.id });
    expect(third.ok).toBe(false);
  });

  it("refuses a duplicate name among siblings, whatever the case", async () => {
    const science = await category("Science");
    const result = await taxonomy.createCategory(adminId, { name: name("physics").toUpperCase(), parentId: science.id });
    expect(result.ok).toBe(false);
  });

  it("keeps the slug when renamed", async () => {
    const before = await category("Physics");
    expect(await taxonomy.renameCategory(adminId, before.id, name("Physics and optics"))).toEqual({ ok: true });
    const after = await category("Physics and optics");
    expect(after.slug).toBe(before.slug);
  });

  it("moves a category among its siblings", async () => {
    const science = await category("Science");
    await taxonomy.createCategory(adminId, { name: name("Chemistry"), parentId: science.id });
    const children = () =>
      db.category.findMany({ where: { parentId: science.id }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { name: true } });
    expect((await children()).map((row) => row.name)).toEqual([name("Physics and optics"), name("Chemistry")]);
    const chemistry = await category("Chemistry");
    expect(await taxonomy.moveCategory(adminId, chemistry.id, "up")).toEqual({ ok: true });
    expect((await children()).map((row) => row.name)).toEqual([name("Chemistry"), name("Physics and optics")]);
  });

  it("keeps a category that still has subcategories or courses", async () => {
    const science = await category("Science");
    expect(await taxonomy.deleteCategory(adminId, science.id)).toEqual({ ok: false, message: "Move or delete its subcategories first." });

    const chemistry = await category("Chemistry");
    await db.course.update({ where: { id: courseId }, data: { primaryCategoryId: chemistry.id } });
    expect((await taxonomy.deleteCategory(adminId, chemistry.id)).ok).toBe(false);
    await db.course.update({ where: { id: courseId }, data: { primaryCategoryId: null } });
    expect(await taxonomy.deleteCategory(adminId, chemistry.id)).toEqual({ ok: true });
  });

  it("gives a clashing slug a suffix", async () => {
    await taxonomy.createCategory(adminId, { name: name("Maths"), parentId: null });
    const first = await category("Maths");
    await db.category.update({ where: { id: first.id }, data: { name: name("Old maths") } });
    await taxonomy.createCategory(adminId, { name: name("Maths"), parentId: null });
    expect((await category("Maths")).slug).toBe(`${first.slug}-2`);
  });
});

describe("topics and skills", () => {
  it("adds, renames and refuses duplicates", async () => {
    expect(await taxonomy.createTag(adminId, "topic", name("Rust"))).toEqual({ ok: true });
    expect((await taxonomy.createTag(adminId, "topic", name("rust"))).ok).toBe(false);
    const rust = await db.topic.findFirstOrThrow({ where: { name: name("Rust") }, select: { id: true, slug: true } });
    expect(await taxonomy.renameTag(adminId, "topic", rust.id, name("Rust language"))).toEqual({ ok: true });
    expect((await db.topic.findUniqueOrThrow({ where: { id: rust.id }, select: { slug: true } })).slug).toBe(rust.slug);
  });

  it("sets a course's category, topics and skills, dropping ids that no longer exist", async () => {
    await taxonomy.createTag(adminId, "skill", name("Systems programming"));
    const rust = await db.topic.findFirstOrThrow({ where: { name: name("Rust language") }, select: { id: true } });
    const skill = await db.skill.findFirstOrThrow({ where: { name: name("Systems programming") }, select: { id: true } });
    const maths = await category("Maths");

    const result = await taxonomy.setCourseTaxonomy(adminId, courseId, {
      categoryId: maths.id,
      topicIds: [rust.id, randomUUID()],
      skillIds: [skill.id],
    });
    expect(result).toEqual({ ok: true });
    const saved = await taxonomy.getCourseTaxonomy(courseId);
    expect(saved).toEqual({ primaryCategoryId: maths.id, topics: [{ topicId: rust.id }], skills: [{ skillId: skill.id }] });

    const audit = await db.auditLog.findFirst({ where: { actorId: adminId, action: "course.taxonomy", targetId: courseId } });
    expect(audit).not.toBeNull();
  });

  it("lets the catalog search find a course by its topic", async () => {
    const page = await listPublishedCourses({ query: name("Rust language") });
    expect(page.items.map((course) => course.id)).toContain(courseId);
  });

  it("takes a deleted topic off its courses", async () => {
    const rust = await db.topic.findFirstOrThrow({ where: { name: name("Rust language") }, select: { id: true } });
    expect(await taxonomy.deleteTag(adminId, "topic", rust.id)).toEqual({ ok: true });
    expect(await db.courseTopic.count({ where: { courseId } })).toBe(0);
  });

  it("audits every write", async () => {
    const actions = (await db.auditLog.findMany({ where: { actorId: adminId }, select: { action: true } })).map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "taxonomy.category.create",
        "taxonomy.category.rename",
        "taxonomy.category.move",
        "taxonomy.category.delete",
        "taxonomy.topic.create",
        "taxonomy.topic.rename",
        "taxonomy.topic.delete",
        "taxonomy.skill.create",
        "course.taxonomy",
      ]),
    );
  });
});
