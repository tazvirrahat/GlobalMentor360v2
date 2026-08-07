import type { Prisma } from "@/generated/prisma/client";
import type { CourseLevel } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * Read models for the public catalog.
 *
 * Only PUBLISHED courses are ever returned. Drafts and unpublished courses must
 * not be discoverable, so the status filter lives here rather than at each call
 * site where it could be forgotten.
 */

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatPrice(amount: number, currency: string): string {
  // Amounts are stored as integer minor units.
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount / 100);
}

export type CatalogFilters = {
  /** Case-insensitive substring match on title, subtitle or description. */
  query?: string;
  level?: CourseLevel;
  categorySlug?: string;
};

export async function listPublishedCourses(filters: CatalogFilters = {}) {
  const { query, level, categorySlug } = filters;

  const where: Prisma.CourseWhereInput = {
    status: "PUBLISHED",
    ...(level ? { level } : {}),
    ...(categorySlug ? { primaryCategory: { slug: categorySlug } } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { subtitle: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const courses = await db.course.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      subtitle: true,
      level: true,
      ratingAverage: true,
      ratingCount: true,
      enrollmentCount: true,
      instructor: { select: { name: true } },
      primaryCategory: { select: { name: true, slug: true } },
      prices: {
        where: { isActive: true },
        select: { amount: true, currency: true },
      },
      sections: {
        select: {
          items: { select: { lecture: { select: { durationSeconds: true } } } },
        },
      },
    },
  });

  return courses.map((course) => {
    const seconds = course.sections
      .flatMap((section) => section.items)
      .reduce((sum, item) => sum + (item.lecture?.durationSeconds ?? 0), 0);

    const lectureCount = course.sections
      .flatMap((section) => section.items)
      .filter((item) => item.lecture !== null).length;

    return {
      ...course,
      totalDuration: formatDuration(seconds),
      lectureCount,
      price: course.prices[0] ?? null,
    };
  });
}

/** Categories that have at least one published course — for catalog filter pills. */
export async function listCatalogCategories() {
  return db.category.findMany({
    where: { courses: { some: { status: "PUBLISHED" } } },
    orderBy: { position: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

export async function getPublishedCourseBySlug(slug: string) {
  const course = await db.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
      subtitle: true,
      description: true,
      level: true,
      language: true,
      ratingAverage: true,
      ratingCount: true,
      enrollmentCount: true,
      publishedAt: true,
      instructor: { select: { name: true, headline: true, bio: true } },
      primaryCategory: { select: { name: true, slug: true } },
      objectives: { orderBy: { position: "asc" }, select: { text: true } },
      requirements: { orderBy: { position: "asc" }, select: { text: true } },
      targetAudience: { orderBy: { position: "asc" }, select: { text: true } },
      prices: { where: { isActive: true }, select: { amount: true, currency: true } },
      sections: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          items: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              type: true,
              isPreview: true,
              lecture: { select: { contentType: true, durationSeconds: true } },
            },
          },
        },
      },
    },
  });

  if (!course) return null;

  const allItems = course.sections.flatMap((section) => section.items);
  const totalSeconds = allItems.reduce(
    (sum, item) => sum + (item.lecture?.durationSeconds ?? 0),
    0,
  );

  return {
    ...course,
    price: course.prices[0] ?? null,
    totalDuration: formatDuration(totalSeconds),
    itemCount: allItems.length,
    sections: course.sections.map((section) => ({
      ...section,
      duration: formatDuration(
        section.items.reduce((sum, item) => sum + (item.lecture?.durationSeconds ?? 0), 0),
      ),
    })),
  };
}

export { formatDuration };
