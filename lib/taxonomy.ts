import { db } from "@/lib/db";
import { slugify } from "@/lib/studio";
import { COURSE_TAG_MAX, TAXONOMY_NAME_MAX } from "@/lib/taxonomy-rules";

/**
 * The catalog's taxonomy, edited by admins: categories (a
 * subject and its subcategories, two levels), topics and skills. Every write
 * is audited. Slugs come from the name once and stay put on rename, so links
 * keep working. A category that still holds courses or subcategories cannot
 * be deleted; deleting a topic or skill takes it off its courses.
 */

export type TaxonomyResult = { ok: true } | { ok: false; message: string };
export type TagKind = "topic" | "skill";


const TAG_LABEL: Record<TagKind, string> = { topic: "topic", skill: "skill" };

function cleanName(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.replace(/\s+/g, " ").trim();
  if (value.length < 2) return { ok: false, message: "Names need at least 2 characters." };
  if (value.length > TAXONOMY_NAME_MAX) return { ok: false, message: `Names can be up to ${TAXONOMY_NAME_MAX} characters.` };
  return { ok: true, value };
}

async function audit(adminId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>) {
  await db.auditLog.create({ data: { actorId: adminId, action, targetType, targetId, metadata: metadata as object } });
}

async function freeSlug(base: string, taken: (slug: string) => Promise<boolean>, fallback: string): Promise<string> {
  const root = base || fallback;
  let candidate = root;
  for (let suffix = 2; await taken(candidate); suffix++) candidate = `${root}-${suffix}`;
  return candidate;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type TaxonomyCategory = {
  id: string;
  name: string;
  slug: string;
  courseCount: number;
  children: { id: string; name: string; slug: string; courseCount: number }[];
};
export type TaxonomyTag = { id: string; name: string; slug: string; courseCount: number };

export async function listTaxonomy(): Promise<{ categories: TaxonomyCategory[]; topics: TaxonomyTag[]; skills: TaxonomyTag[] }> {
  const [categories, topics, skills] = await Promise.all([
    db.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, parentId: true, _count: { select: { courses: true } } },
    }),
    db.topic.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, _count: { select: { courses: true } } } }),
    db.skill.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, _count: { select: { courses: true } } } }),
  ]);
  const tag = (row: { id: string; name: string; slug: string; _count: { courses: number } }) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    courseCount: row._count.courses,
  });
  return {
    categories: categories
      .filter((row) => row.parentId === null)
      .map((root) => ({
        ...tag(root),
        children: categories.filter((row) => row.parentId === root.id).map(tag),
      })),
    topics: topics.map(tag),
    skills: skills.map(tag),
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

async function siblingNameTaken(name: string, parentId: string | null, exceptId?: string) {
  const match = await db.category.findFirst({
    where: { parentId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return match !== null;
}

export async function createCategory(adminId: string, input: { name: string; parentId: string | null }): Promise<TaxonomyResult> {
  const name = cleanName(input.name);
  if (!name.ok) return name;
  if (input.parentId) {
    const parent = await db.category.findUnique({ where: { id: input.parentId }, select: { parentId: true } });
    if (!parent) return { ok: false, message: "That subject no longer exists." };
    if (parent.parentId) return { ok: false, message: "Categories go two levels deep: a subject and its subcategories." };
  }
  if (await siblingNameTaken(name.value, input.parentId)) {
    return { ok: false, message: `There is already a category called “${name.value}” here.` };
  }

  const last = await db.category.aggregate({ where: { parentId: input.parentId }, _max: { position: true } });
  const slug = await freeSlug(
    slugify(name.value),
    async (candidate) => (await db.category.findUnique({ where: { slug: candidate }, select: { id: true } })) !== null,
    "category",
  );
  const row = await db.category.create({
    data: { name: name.value, slug, parentId: input.parentId, position: (last._max.position ?? -1) + 1 },
    select: { id: true },
  });
  await audit(adminId, "taxonomy.category.create", "category", row.id, { name: name.value, parentId: input.parentId });
  return { ok: true };
}

export async function renameCategory(adminId: string, id: string, rawName: string): Promise<TaxonomyResult> {
  const name = cleanName(rawName);
  if (!name.ok) return name;
  const category = await db.category.findUnique({ where: { id }, select: { name: true, parentId: true } });
  if (!category) return { ok: false, message: "That category no longer exists." };
  if (await siblingNameTaken(name.value, category.parentId, id)) {
    return { ok: false, message: `There is already a category called “${name.value}” here.` };
  }
  await db.category.update({ where: { id }, data: { name: name.value } });
  await audit(adminId, "taxonomy.category.rename", "category", id, { from: category.name, to: name.value });
  return { ok: true };
}

/** Swaps a category with its neighbour among its siblings (renumbering them 0…n first). */
export async function moveCategory(adminId: string, id: string, direction: "up" | "down"): Promise<TaxonomyResult> {
  const category = await db.category.findUnique({ where: { id }, select: { parentId: true } });
  if (!category) return { ok: false, message: "That category no longer exists." };
  const siblings = await db.category.findMany({
    where: { parentId: category.parentId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const index = siblings.findIndex((row) => row.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) return { ok: true };

  const order = siblings.map((row) => row.id);
  [order[index], order[target]] = [order[target]!, order[index]!];
  await db.$transaction(order.map((rowId, position) => db.category.update({ where: { id: rowId }, data: { position } })));
  await audit(adminId, "taxonomy.category.move", "category", id, { direction });
  return { ok: true };
}

export async function deleteCategory(adminId: string, id: string): Promise<TaxonomyResult> {
  const category = await db.category.findUnique({
    where: { id },
    select: { name: true, _count: { select: { courses: true, children: true } } },
  });
  if (!category) return { ok: false, message: "That category no longer exists." };
  if (category._count.children > 0) return { ok: false, message: "Move or delete its subcategories first." };
  if (category._count.courses > 0) {
    return { ok: false, message: "Courses still use this category. Give them another one first." };
  }
  await db.category.delete({ where: { id } });
  await audit(adminId, "taxonomy.category.delete", "category", id, { name: category.name });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Topics and skills
// ---------------------------------------------------------------------------

async function tagNameTaken(kind: TagKind, name: string, exceptId?: string) {
  const where = { name: { equals: name, mode: "insensitive" as const }, ...(exceptId ? { id: { not: exceptId } } : {}) };
  const match =
    kind === "topic"
      ? await db.topic.findFirst({ where, select: { id: true } })
      : await db.skill.findFirst({ where, select: { id: true } });
  return match !== null;
}

async function tagSlugTaken(kind: TagKind, slug: string) {
  const match =
    kind === "topic"
      ? await db.topic.findUnique({ where: { slug }, select: { id: true } })
      : await db.skill.findUnique({ where: { slug }, select: { id: true } });
  return match !== null;
}

export async function createTag(adminId: string, kind: TagKind, rawName: string): Promise<TaxonomyResult> {
  const name = cleanName(rawName);
  if (!name.ok) return name;
  if (await tagNameTaken(kind, name.value)) return { ok: false, message: `There is already a ${TAG_LABEL[kind]} called “${name.value}”.` };
  const slug = await freeSlug(slugify(name.value), (candidate) => tagSlugTaken(kind, candidate), kind);
  const data = { name: name.value, slug };
  const row =
    kind === "topic"
      ? await db.topic.create({ data, select: { id: true } })
      : await db.skill.create({ data, select: { id: true } });
  await audit(adminId, `taxonomy.${kind}.create`, kind, row.id, { name: name.value });
  return { ok: true };
}

export async function renameTag(adminId: string, kind: TagKind, id: string, rawName: string): Promise<TaxonomyResult> {
  const name = cleanName(rawName);
  if (!name.ok) return name;
  const current =
    kind === "topic"
      ? await db.topic.findUnique({ where: { id }, select: { name: true } })
      : await db.skill.findUnique({ where: { id }, select: { name: true } });
  if (!current) return { ok: false, message: `That ${TAG_LABEL[kind]} no longer exists.` };
  if (await tagNameTaken(kind, name.value, id)) return { ok: false, message: `There is already a ${TAG_LABEL[kind]} called “${name.value}”.` };
  if (kind === "topic") await db.topic.update({ where: { id }, data: { name: name.value } });
  else await db.skill.update({ where: { id }, data: { name: name.value } });
  await audit(adminId, `taxonomy.${kind}.rename`, kind, id, { from: current.name, to: name.value });
  return { ok: true };
}

export async function deleteTag(adminId: string, kind: TagKind, id: string): Promise<TaxonomyResult> {
  const current =
    kind === "topic"
      ? await db.topic.findUnique({ where: { id }, select: { name: true, _count: { select: { courses: true } } } })
      : await db.skill.findUnique({ where: { id }, select: { name: true, _count: { select: { courses: true } } } });
  if (!current) return { ok: false, message: `That ${TAG_LABEL[kind]} no longer exists.` };
  // Course links cascade (course_topics / course_skills).
  if (kind === "topic") await db.topic.delete({ where: { id } });
  else await db.skill.delete({ where: { id } });
  await audit(adminId, `taxonomy.${kind}.delete`, kind, id, { name: current.name, courses: current._count.courses });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// One course
// ---------------------------------------------------------------------------

export async function getCourseTaxonomy(courseId: string) {
  return db.course.findUnique({
    where: { id: courseId },
    select: {
      primaryCategoryId: true,
      topics: { select: { topicId: true } },
      skills: { select: { skillId: true } },
    },
  });
}

export async function setCourseTaxonomy(
  adminId: string,
  courseId: string,
  input: { categoryId: string | null; topicIds: string[]; skillIds: string[] },
): Promise<TaxonomyResult> {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return { ok: false, message: "That course no longer exists." };
  if (input.categoryId && !(await db.category.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) {
    return { ok: false, message: "That category no longer exists." };
  }
  const topicIds = [...new Set(input.topicIds)];
  const skillIds = [...new Set(input.skillIds)];
  if (topicIds.length > COURSE_TAG_MAX || skillIds.length > COURSE_TAG_MAX) {
    return { ok: false, message: `A course can have up to ${COURSE_TAG_MAX} topics and ${COURSE_TAG_MAX} skills.` };
  }
  // Ids that no longer exist are dropped rather than failing the whole save.
  const [topics, skills] = await Promise.all([
    db.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true } }),
    db.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true } }),
  ]);

  await db.$transaction([
    db.course.update({ where: { id: courseId }, data: { primaryCategoryId: input.categoryId } }),
    db.courseTopic.deleteMany({ where: { courseId } }),
    db.courseTopic.createMany({ data: topics.map((row) => ({ courseId, topicId: row.id })) }),
    db.courseSkill.deleteMany({ where: { courseId } }),
    db.courseSkill.createMany({ data: skills.map((row) => ({ courseId, skillId: row.id })) }),
  ]);
  await audit(adminId, "course.taxonomy", "course", courseId, {
    categoryId: input.categoryId,
    topics: topics.length,
    skills: skills.length,
  });
  return { ok: true };
}
