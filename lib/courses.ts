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

/**
 * How the catalog is ordered.
 *
 * `relevance` is deliberately absent. Search is a substring match, so there is no
 * relevance score to sort by — offering the option would be a control that
 * silently does nothing. It arrives with Postgres full-text search, which
 * TECH-SPEC already plans; until then `newest` is the honest default.
 */
export type CatalogSort = "newest" | "popular" | "rating" | "price-low" | "price-high";

export type CatalogFilters = {
  /** Case-insensitive substring match on title, subtitle or description. */
  query?: string;
  level?: CourseLevel;
  categorySlug?: string;
  /** ISO code on Course.language, e.g. "en". */
  language?: string;
  /** Only courses whose displayed price is 0, or only those above it. */
  price?: "free" | "paid";
  /** Minimum star rating, 1-5. Reads the denormalised aggregate. */
  minRating?: number;
  sort?: CatalogSort;
};

/**
 * The catalog is a public page with no pagination control, so the read is capped
 * rather than left to grow with the catalog. Unbounded findMany on a public
 * route is the shape that made the announcements panel load every announcement
 * ever sent on every page view.
 */
export const CATALOG_PAGE_SIZE = 48;

/**
 * Only the orderings the database can actually apply.
 *
 * price-low / price-high are absent here on purpose: the displayed price is
 * chosen per rail by selectDisplayPrice after the rows come back, so Postgres
 * cannot order by it without either a denormalised column or a join that picks
 * the same currency this code does. Those two sorts are applied in memory below,
 * within the capped page — which is honest about being a page-local sort rather
 * than pretending to be a global one.
 */
const DB_ORDER: Record<
  Exclude<CatalogSort, "price-low" | "price-high">,
  Prisma.CourseOrderByWithRelationInput
> = {
  newest: { publishedAt: "desc" },
  popular: { enrollmentCount: "desc" },
  rating: { ratingAverage: "desc" },
};

export async function listPublishedCourses(filters: CatalogFilters = {}) {
  const { query, level, categorySlug, language, price, minRating, sort = "newest" } = filters;

  const where: Prisma.CourseWhereInput = {
    status: "PUBLISHED",
    ...(level ? { level } : {}),
    ...(categorySlug ? { primaryCategory: { slug: categorySlug } } : {}),
    ...(language ? { language } : {}),
    ...(minRating ? { ratingAverage: { gte: minRating } } : {}),
    // "free" is every active price being zero, matching isFreeCourse — a course
    // with a zero BDT price and a paid USD one is not free to the learner who
    // sees the USD one. `none` and `some` express that without a second dialect.
    ...(price === "free"
      ? { prices: { none: { isActive: true, amount: { gt: 0 } } } }
      : {}),
    ...(price === "paid" ? { prices: { some: { isActive: true, amount: { gt: 0 } } } } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { subtitle: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            // Searching the instructor is a P0 line in FEATURES section B and
            // costs one relation filter here.
            { instructor: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const courses = await db.course.findMany({
    where,
    take: CATALOG_PAGE_SIZE,
    orderBy: DB_ORDER[sort === "price-low" || sort === "price-high" ? "newest" : sort],
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

  const mapped = courses.map((course) => {
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

  if (sort === "price-low" || sort === "price-high") {
    // Sorted here, not in SQL, because the price a learner sees is chosen per
    // rail by selectDisplayPrice above — the database has no single column to
    // order by. That makes this a sort within the capped page rather than across
    // the whole catalog; at CATALOG_PAGE_SIZE the two coincide, and the day the
    // catalog outgrows one page this needs a denormalised display price rather
    // than a bigger cap.
    const direction = sort === "price-low" ? 1 : -1;
    mapped.sort((a, b) => ((a.price?.amount ?? 0) - (b.price?.amount ?? 0)) * direction);
  }

  return mapped;
}

/** The languages actually present in the catalog, so the filter offers no dead options. */
export async function listCatalogLanguages(): Promise<string[]> {
  const rows = await db.course.findMany({
    where: { status: "PUBLISHED" },
    distinct: ["language"],
    orderBy: { language: "asc" },
    select: { language: true },
  });

  return rows.map((row) => row.language);
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
