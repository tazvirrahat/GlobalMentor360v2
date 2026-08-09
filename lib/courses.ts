import type { Prisma } from "@/generated/prisma/client";
import type { CourseLevel } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { BKASH_CURRENCY, STRIPE_CURRENCY } from "@/lib/payments";

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

/**
 * Currency preference for the single price a learner is shown, best first.
 *
 * A course carries one active price *per rail* — USD for Stripe, BDT for bKash —
 * so two active prices is the normal case and "the price" is a choice, not a
 * lookup. Reading whichever row Postgres happened to return first meant the
 * catalog card, the landing page and the free/paid decision could each land on a
 * different currency, and could disagree with themselves between requests.
 *
 * The order mirrors `RAILS` in lib/payments: the automatic rail is the better
 * offer and leads at checkout, so it leads in the catalog too. Checkout still
 * prices each rail separately — this only decides the headline.
 *
 * Picking the currency the learner can actually pay in is the better answer, and
 * it needs a locale or region signal we do not collect yet. Until then the point
 * is that every surface gives the same answer every time.
 */
const DISPLAY_CURRENCIES: readonly string[] = [STRIPE_CURRENCY, BKASH_CURRENCY];

export type ActivePrice = { amount: number; currency: string };

/**
 * The one price to render for a course. Null means the course has no active
 * price at all — which is "not purchasable", never "free".
 */
export function selectDisplayPrice<T extends ActivePrice>(prices: readonly T[]): T | null {
  for (const currency of DISPLAY_CURRENCIES) {
    const match = prices.find((price) => price.currency === currency);
    if (match) return match;
  }

  // A currency no rail sells in yet still has to render as the same thing on
  // every request, so fall through to a total order rather than to row order.
  return [...prices].sort((a, b) => a.currency.localeCompare(b.currency))[0] ?? null;
}

/**
 * Free means *every* rail is free. A course priced USD 49 and BDT 0 still
 * charges on one of its rails, so it is not free — and `enrollFree` refuses it,
 * which is why the UI must not offer it either.
 *
 * No active price is not free either. Absence of pricing data means the course
 * cannot be sold; the opposite default hands a course out for nothing the moment
 * its last price is archived.
 */
export function isFreeCourse(prices: readonly { amount: number }[]): boolean {
  return prices.length > 0 && prices.every((price) => price.amount === 0);
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
        orderBy: { currency: "asc" },
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
      price: selectDisplayPrice(course.prices),
      isFree: isFreeCourse(course.prices),
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
      prices: {
        where: { isActive: true },
        orderBy: { currency: "asc" },
        select: { amount: true, currency: true },
      },
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
    price: selectDisplayPrice(course.prices),
    isFree: isFreeCourse(course.prices),
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
