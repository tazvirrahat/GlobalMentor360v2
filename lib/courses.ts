import { Prisma } from "@/generated/prisma/client";
import type { CourseLevel } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { durationBucket, type DurationBucket } from "@/lib/catalog-duration";
import { formatHoursMinutes } from "@/lib/format";
import { clampPage, pageCount, skipTake, type Paged } from "@/lib/pagination";
import { BKASH_CURRENCY, STRIPE_CURRENCY } from "@/lib/payments";

export { formatHoursMinutes as formatDuration, formatPrice } from "@/lib/format";

/**
 * Read models for the public catalog.
 *
 * Only PUBLISHED courses are ever returned. Drafts and unpublished courses must
 * not be discoverable, so the status filter lives here rather than at each call
 * site where it could be forgotten.
 */

/**
 * Currency preference for the single price a learner is shown, best first.
 *
 * A course carries one active price *per rail* — USD for Stripe, BDT for bKash —
 * so two active prices is the normal case and "the price" is a choice, not a
 * lookup. Reading whichever row Postgres happened to return first meant the
 * catalog card, the landing page and the free/paid decision could each land on a
 * different currency, and could disagree with themselves between requests.
 *
 * BDT leads because bKash is the rail that always works: it needs no credentials,
 * while Stripe hides itself without keys. Leading with USD had the catalog quote
 * a price the checkout could not take — a learner saw "$49" on the card and
 * "Amount to send: ৳5,990" (or "No payment methods") one click later. Checkout
 * still prices each rail separately — this only decides the headline, and it
 * must be the headline the live rail can honour.
 */
const DISPLAY_CURRENCIES: readonly string[] = [BKASH_CURRENCY, STRIPE_CURRENCY];

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
 * `relevance` is the ranked full-text order and is the default whenever a query
 * is present. Without a query it is identical to `newest` — there is nothing
 * to rank.
 */
export type CatalogSort = "newest" | "popular" | "rating" | "price-low" | "price-high" | "relevance";

export type CatalogFilters = {
  /** Full-text / trigram search across title, subtitle, description, instructor, topics and skills. */
  query?: string;
  level?: CourseLevel;
  categorySlug?: string;
  /** ISO code on Course.language, e.g. "en". */
  language?: string;
  /** Only courses whose displayed price is 0, or only those above it. */
  price?: "free" | "paid";
  /** Minimum star rating, 1-5. Reads the denormalised aggregate. */
  minRating?: number;
  /** Course length bucket, from the summed lecture durations. */
  duration?: DurationBucket;
  sort?: CatalogSort;
  page?: string | number;
};

/**
 * One catalog page. The public /courses route pages with ?page= rather than
 * silently dropping everything past the first 24.
 */
export const CATALOG_PAGE_SIZE = 24;

/**
 * Only the orderings Prisma can apply without a search.
 *
 * price-low / price-high stay out: the displayed price is chosen per rail by
 * selectDisplayPrice after the rows come back. Those two sorts still run in
 * memory on the current page — a global price order needs a denormalised
 * display-price column, which this pass does not add.
 */
const DB_ORDER: Record<
  Exclude<CatalogSort, "price-low" | "price-high" | "relevance">,
  Prisma.CourseOrderByWithRelationInput
> = {
  newest: { publishedAt: "desc" },
  popular: { enrollmentCount: "desc" },
  rating: { ratingAverage: "desc" },
};

const CATALOG_SELECT = {
  id: true,
  title: true,
  slug: true,
  subtitle: true,
  thumbnailUrl: true,
  level: true,
  ratingAverage: true,
  ratingCount: true,
  enrollmentCount: true,
  instructor: { select: { name: true } },
  primaryCategory: { select: { name: true, slug: true } },
  prices: {
    where: { isActive: true },
    orderBy: { currency: "asc" as const },
    select: { amount: true, currency: true },
  },
  // Nested duration / lecture count: left as a per-card walk of sections → items
  // → lecture. Denormalising those onto Course is a later pass.
  sections: {
    select: {
      items: { select: { lecture: { select: { durationSeconds: true } } } },
    },
  },
} as const;

/**
 * Strips query operators so websearch_to_tsquery cannot be fed punctuation that
 * makes it throw. Letters, numbers, spaces, apostrophes and hyphens stay.
 */
export function sanitizeSearchQuery(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function ilikePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, "\\$&")}%`;
}

function catalogFilterSql(input: {
  search: string;
  level?: CourseLevel;
  categorySlug?: string;
  language?: string;
  price?: "free" | "paid";
  minRating?: number;
  duration?: DurationBucket;
}): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`c.status = 'PUBLISHED'`];

  if (input.level) {
    parts.push(Prisma.sql`c.level = ${input.level}::"CourseLevel"`);
  }
  if (input.language) {
    parts.push(Prisma.sql`c.language = ${input.language}`);
  }
  if (input.minRating) {
    parts.push(Prisma.sql`c."ratingAverage" >= ${input.minRating}`);
  }
  if (input.categorySlug) {
    // A subject ("Development") includes its subcategories' courses.
    parts.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM categories cat
        LEFT JOIN categories parent ON parent.id = cat."parentId"
        WHERE cat.id = c."primaryCategoryId"
          AND (cat.slug = ${input.categorySlug} OR parent.slug = ${input.categorySlug})
      )`,
    );
  }
  if (input.price === "free") {
    parts.push(
      Prisma.sql`NOT EXISTS (
        SELECT 1 FROM prices p
        WHERE p."courseId" = c.id AND p."isActive" = true AND p.amount > 0
      )`,
    );
  }
  if (input.price === "paid") {
    parts.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM prices p
        WHERE p."courseId" = c.id AND p."isActive" = true AND p.amount > 0
      )`,
    );
  }
  if (input.duration) {
    // The same total the course row shows: every lecture's duration summed.
    const { minSeconds, maxSeconds } = durationBucket(input.duration);
    const total = Prisma.sql`(
      SELECT COALESCE(SUM(l."durationSeconds"), 0)
      FROM sections s
      JOIN curriculum_items ci ON ci."sectionId" = s.id
      JOIN lectures l ON l."curriculumItemId" = ci.id
      WHERE s."courseId" = c.id
    )`;
    parts.push(Prisma.sql`${total} >= ${minSeconds}`);
    if (maxSeconds !== null) parts.push(Prisma.sql`${total} < ${maxSeconds}`);
  }
  if (input.search) {
    const pattern = ilikePattern(input.search);
    parts.push(
      Prisma.sql`(
        c.search_vector @@ websearch_to_tsquery('english', ${input.search})
        OR c.title ILIKE ${pattern}
        OR COALESCE(c.subtitle, '') ILIKE ${pattern}
        OR COALESCE(c.description, '') ILIKE ${pattern}
        OR u.name ILIKE ${pattern}
        -- A course's topics and skills (admin-set) count too, so "Related topics" links find it.
        OR EXISTS (
          SELECT 1 FROM course_topics ct JOIN topics t ON t.id = ct."topicId"
          WHERE ct."courseId" = c.id AND t.name ILIKE ${pattern}
        )
        OR EXISTS (
          SELECT 1 FROM course_skills cs JOIN skills k ON k.id = cs."skillId"
          WHERE cs."courseId" = c.id AND k.name ILIKE ${pattern}
        )
      )`,
    );
  }

  return Prisma.join(parts, " AND ");
}

/** Full ORDER BY clause so Prisma does not wrap comma-separated keys in parentheses. */
function catalogOrderClause(sort: CatalogSort, search: string): Prisma.Sql {
  if (sort === "relevance" && search) {
    return Prisma.sql`ORDER BY COALESCE(ts_rank(c.search_vector, websearch_to_tsquery('english', ${search})), 0) DESC, c."publishedAt" DESC NULLS LAST`;
  }
  if (sort === "popular") {
    return Prisma.sql`ORDER BY c."enrollmentCount" DESC, c."publishedAt" DESC NULLS LAST`;
  }
  if (sort === "rating") {
    return Prisma.sql`ORDER BY c."ratingAverage" DESC, c."publishedAt" DESC NULLS LAST`;
  }
  return Prisma.sql`ORDER BY c."publishedAt" DESC NULLS LAST`;
}

function catalogPrismaWhere(filters: {
  level?: CourseLevel;
  categorySlug?: string;
  language?: string;
  price?: "free" | "paid";
  minRating?: number;
}): Prisma.CourseWhereInput {
  return {
    status: "PUBLISHED",
    ...(filters.level ? { level: filters.level } : {}),
    // A subject ("Development") includes its subcategories' courses.
    ...(filters.categorySlug
      ? {
          OR: [
            { primaryCategory: { slug: filters.categorySlug } },
            { primaryCategory: { parent: { slug: filters.categorySlug } } },
          ],
        }
      : {}),
    ...(filters.language ? { language: filters.language } : {}),
    ...(filters.minRating ? { ratingAverage: { gte: filters.minRating } } : {}),
    // "free" is every active price being zero, matching isFreeCourse — a course
    // with a zero BDT price and a paid USD one is not free to the learner who
    // sees the USD one. `none` and `some` express that without a second dialect.
    ...(filters.price === "free"
      ? { prices: { none: { isActive: true, amount: { gt: 0 } } } }
      : {}),
    ...(filters.price === "paid" ? { prices: { some: { isActive: true, amount: { gt: 0 } } } } : {}),
  };
}

function mapCatalogCourse<
  T extends {
    sections: { items: { lecture: { durationSeconds: number } | null }[] }[];
    prices: ActivePrice[];
  },
>(course: T) {
  const seconds = course.sections
    .flatMap((section) => section.items)
    .reduce((sum, item) => sum + (item.lecture?.durationSeconds ?? 0), 0);

  const lectureCount = course.sections
    .flatMap((section) => section.items)
    .filter((item) => item.lecture !== null).length;

  return {
    ...course,
    totalDuration: formatHoursMinutes(seconds),
    lectureCount,
    price: selectDisplayPrice(course.prices),
    isFree: isFreeCourse(course.prices),
  };
}

export type CatalogCourse = ReturnType<typeof mapCatalogCourse> & {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  level: CourseLevel;
  ratingAverage: number;
  ratingCount: number;
  enrollmentCount: number;
  instructor: { name: string };
  primaryCategory: { name: string; slug: string } | null;
};

export type CatalogPage = Paged<CatalogCourse>;

/** Cheap homepage stat — count(*) of published rows, not the length of a page. */
export async function countPublishedCourses(): Promise<number> {
  return db.course.count({ where: { status: "PUBLISHED" } });
}

async function searchPublishedCourseTotal(input: {
  search: string;
  level?: CourseLevel;
  categorySlug?: string;
  language?: string;
  price?: "free" | "paid";
  minRating?: number;
  duration?: DurationBucket;
}): Promise<number> {
  const whereSql = catalogFilterSql(input);
  const countRows = await db.$queryRaw<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM courses c
    INNER JOIN users u ON u.id = c."instructorId"
    WHERE ${whereSql}
  `;
  return countRows[0]?.total ?? 0;
}

async function searchPublishedCourseIds(input: {
  search: string;
  level?: CourseLevel;
  categorySlug?: string;
  language?: string;
  price?: "free" | "paid";
  minRating?: number;
  duration?: DurationBucket;
  sort: CatalogSort;
  skip: number;
  take: number;
}): Promise<string[]> {
  const whereSql = catalogFilterSql(input);
  const orderClause = catalogOrderClause(input.sort, input.search);
  const idRows = await db.$queryRaw<{ id: string }[]>`
    SELECT c.id
    FROM courses c
    INNER JOIN users u ON u.id = c."instructorId"
    WHERE ${whereSql}
    ${orderClause}
    LIMIT ${input.take} OFFSET ${input.skip}
  `;
  return idRows.map((row) => row.id);
}

export async function listPublishedCourses(filters: CatalogFilters = {}): Promise<CatalogPage> {
  const { query, level, categorySlug, language, price, minRating, duration } = filters;
  const search = query ? sanitizeSearchQuery(query) : "";
  const sort = filters.sort ?? (search ? "relevance" : "newest");
  const prismaWhere = catalogPrismaWhere({ level, categorySlug, language, price, minRating });
  const searchFilters = { search, level, categorySlug, language, price, minRating, duration };
  // Prisma cannot filter on a summed child column, so a duration filter takes
  // the raw-SQL path, which already carries every other filter.
  const useSql = Boolean(search) || Boolean(duration);

  const total = useSql
    ? await searchPublishedCourseTotal(searchFilters)
    : await db.course.count({ where: prismaWhere });
  const current = clampPage(filters.page ?? 1, total, CATALOG_PAGE_SIZE);
  const empty: CatalogPage = {
    items: [],
    total,
    page: current,
    pageCount: pageCount(total, CATALOG_PAGE_SIZE),
  };
  if (total === 0) return empty;

  const { skip, take } = skipTake(current, CATALOG_PAGE_SIZE);
  const dbSort: Exclude<CatalogSort, "price-low" | "price-high" | "relevance"> =
    sort === "price-low" || sort === "price-high" || sort === "relevance" ? "newest" : sort;

  let ordered;
  if (useSql) {
    const ids = await searchPublishedCourseIds({ ...searchFilters, sort, skip, take });
    if (ids.length === 0) return empty;
    const courses = await db.course.findMany({
      where: { id: { in: ids }, status: "PUBLISHED" },
      select: CATALOG_SELECT,
    });
    const byId = new Map(courses.map((course) => [course.id, course]));
    ordered = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  } else {
    ordered = await db.course.findMany({
      where: prismaWhere,
      skip,
      take,
      orderBy: DB_ORDER[dbSort],
      select: CATALOG_SELECT,
    });
  }

  const mapped = ordered.map(mapCatalogCourse);

  if (sort === "price-low" || sort === "price-high") {
    // Sorted here, not in SQL, because the price a learner sees is chosen per
    // rail by selectDisplayPrice — the database has no single column to order
    // by. That makes this a sort within the current page rather than across
    // the whole catalog.
    const direction = sort === "price-low" ? 1 : -1;
    mapped.sort((a, b) => ((a.price?.amount ?? 0) - (b.price?.amount ?? 0)) * direction);
  }

  return {
    items: mapped,
    total,
    page: current,
    pageCount: pageCount(total, CATALOG_PAGE_SIZE),
  };
}

/** One instructor's published courses in the catalog row shape, most popular first (the instructor page). */
export async function listInstructorPublishedCourses(instructorId: string, take = 50): Promise<CatalogCourse[]> {
  const rows = await db.course.findMany({
    where: { instructorId, status: "PUBLISHED" },
    orderBy: [{ enrollmentCount: "desc" }, { publishedAt: "desc" }],
    take,
    select: CATALOG_SELECT,
  });
  return rows.map(mapCatalogCourse);
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
      thumbnailUrl: true,
      level: true,
      language: true,
      ratingAverage: true,
      ratingCount: true,
      enrollmentCount: true,
      publishedAt: true,
      updatedAt: true,
      instructor: { select: { name: true, headline: true, bio: true, slug: true, profilePublic: true } },
      primaryCategory: { select: { name: true, slug: true } },
      objectives: { orderBy: { position: "asc" }, select: { text: true } },
      requirements: { orderBy: { position: "asc" }, select: { text: true } },
      targetAudience: { orderBy: { position: "asc" }, select: { text: true } },
      faqs: { orderBy: { position: "asc" }, select: { id: true, question: true, answer: true } },
      topics: { orderBy: { topic: { name: "asc" } }, select: { topic: { select: { name: true, slug: true } } } },
      skills: { orderBy: { skill: { name: "asc" } }, select: { skill: { select: { name: true, slug: true } } } },
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
    totalDuration: formatHoursMinutes(totalSeconds),
    itemCount: allItems.length,
    sections: course.sections.map((section) => ({
      ...section,
      duration: formatHoursMinutes(
        section.items.reduce((sum, item) => sum + (item.lecture?.durationSeconds ?? 0), 0),
      ),
    })),
  };
}
