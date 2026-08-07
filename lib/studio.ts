import { db } from "@/lib/db";

/**
 * Authoring-side reads and guards.
 *
 * Everything here is scoped to the signed-in instructor. Ownership is checked in
 * the query rather than after it — a findUnique followed by an `if` is one early
 * return away from leaking someone else's draft.
 */

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/** Appends -2, -3… until free. Slugs are public URLs, so collisions must not 500. */
export async function uniqueSlug(base: string): Promise<string> {
  const root = base || "course";
  let candidate = root;
  let suffix = 1;

  while (await db.course.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }

  return candidate;
}

export async function listInstructorCourses(instructorId: string) {
  return db.course.findMany({
    where: { instructorId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      updatedAt: true,
      enrollmentCount: true,
      _count: { select: { sections: true } },
    },
  });
}

/** Returns null when the course does not exist OR is not this instructor's. */
export async function getOwnedCourse(courseId: string, instructorId: string) {
  return db.course.findFirst({
    where: { id: courseId, instructorId },
    select: {
      id: true,
      title: true,
      slug: true,
      subtitle: true,
      description: true,
      level: true,
      language: true,
      status: true,
      primaryCategoryId: true,
      prices: { where: { isActive: true }, select: { currency: true, amount: true } },
    },
  });
}

export async function getOwnedCurriculum(courseId: string, instructorId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, instructorId },
    select: {
      id: true,
      title: true,
      status: true,
      sections: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          items: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              type: true,
              position: true,
              isPreview: true,
              lecture: { select: { contentType: true, durationSeconds: true } },
            },
          },
        },
      },
    },
  });

  return course;
}

export type ReadinessCheck = { label: string; ok: boolean; hint: string };

/**
 * What must be true before a course can go live. Publishing something with no
 * content or no price produces a listing nobody can buy or learn from.
 */
export async function readinessChecks(courseId: string): Promise<ReadinessCheck[]> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      subtitle: true,
      sections: { select: { _count: { select: { items: true } } } },
      prices: { where: { isActive: true }, select: { id: true } },
    },
  });

  if (!course) return [];

  const itemCount = course.sections.reduce((sum, s) => sum + s._count.items, 0);

  return [
    {
      label: "Has a title",
      ok: course.title.trim().length > 0,
      hint: "Set a course title.",
    },
    {
      label: "Has a subtitle",
      ok: (course.subtitle ?? "").trim().length > 0,
      hint: "A subtitle is what learners read in search results.",
    },
    {
      label: "Has at least one section",
      ok: course.sections.length > 0,
      hint: "Add a section in the curriculum builder.",
    },
    {
      label: "Has at least one lecture",
      ok: itemCount > 0,
      hint: "Add a lecture to a section.",
    },
    {
      label: "Has a price",
      ok: course.prices.length > 0,
      hint: "Set a price. Use 0 for a free course.",
    },
  ];
}
