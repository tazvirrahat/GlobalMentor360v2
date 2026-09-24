import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { CATALOG_PAGE_SIZE, listPublishedCourses } from "@/lib/courses";

/**
 * Catalog filters and sort.
 *
 * The filters are the front door, so the properties worth pinning are the ones a
 * learner would notice being wrong: a filter that quietly matches an unpublished
 * course, a "free" filter that shows a paid one, and a sort that does nothing.
 */

const run = randomUUID().slice(0, 8);
let instructorId: string;
const courseIds: string[] = [];

async function makeCourse(input: {
  label: string;
  language?: string;
  level?: "BEGINNER" | "ADVANCED";
  published?: boolean;
  rating?: number;
  enrollments?: number;
  priceUsd?: number | null;
}) {
  const course = await db.course.create({
    data: {
      title: `${input.label} ${run}`,
      slug: `${input.label}-${run}`,
      status: input.published === false ? "DRAFT" : "PUBLISHED",
      instructorId,
      language: input.language ?? "en",
      level: input.level ?? "BEGINNER",
      ratingAverage: input.rating ?? 0,
      ratingCount: input.rating ? 10 : 0,
      enrollmentCount: input.enrollments ?? 0,
      publishedAt: new Date(),
    },
    select: { id: true },
  });

  if (input.priceUsd !== null && input.priceUsd !== undefined) {
    await db.price.create({
      data: { courseId: course.id, currency: "USD", amount: input.priceUsd, isActive: true },
    });
  }

  courseIds.push(course.id);
  return course.id;
}

let freeId: string;
let paidCheapId: string;
let paidDearId: string;
let frenchId: string;
let draftId: string;
let mixedPriceId: string;
let childCategoryCourseId: string;
const categoryIds: string[] = [];

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: { name: `Catalog Instructor ${run}`, email: `catalog-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;

  freeId = await makeCourse({ label: "catalog-free", priceUsd: 0, rating: 4.5, enrollments: 5 });
  paidCheapId = await makeCourse({ label: "catalog-cheap", priceUsd: 1000, rating: 3.2 });
  paidDearId = await makeCourse({
    label: "catalog-dear",
    priceUsd: 9900,
    rating: 4.9,
    enrollments: 50,
    level: "ADVANCED",
  });
  frenchId = await makeCourse({ label: "catalog-french", priceUsd: 2000, language: "fr" });
  draftId = await makeCourse({ label: "catalog-draft", priceUsd: 0, published: false });

  // The case the free filter actually hinges on, and the one a single-price
  // fixture cannot reach: a zero price in one currency beside a paid one in
  // another. bKash needs a BDT price and Stripe a USD one, so this is the normal
  // multi-currency shape — and a learner paying in USD is paying 49 dollars.
  mixedPriceId = await makeCourse({ label: "catalog-mixed", priceUsd: 4900 });
  await db.price.create({
    data: { courseId: mixedPriceId, currency: "BDT", amount: 0, isActive: true },
  });

  // A subject with a subcategory: the course sits in the child only.
  const parent = await db.category.create({
    data: { name: `Subject ${run}`, slug: `subject-${run}` },
    select: { id: true },
  });
  const child = await db.category.create({
    data: { name: `Topic ${run}`, slug: `topic-${run}`, parentId: parent.id },
    select: { id: true },
  });
  categoryIds.push(child.id, parent.id);
  childCategoryCourseId = await makeCourse({ label: "catalog-child", priceUsd: 1500 });
  await db.course.update({ where: { id: childCategoryCourseId }, data: { primaryCategoryId: child.id } });
});

afterAll(async () => {
  await db.price.deleteMany({ where: { courseId: { in: courseIds } } });
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  for (const id of categoryIds) await db.category.deleteMany({ where: { id } });
  await db.user.deleteMany({ where: { id: instructorId } });
  await db.$disconnect();
});

/** Only the courses this test created, so a seeded catalog cannot mask a bug. */
function mine(page: { items: { id: string }[] }) {
  return page.items.filter((course) => courseIds.includes(course.id)).map((course) => course.id);
}

describe("filters", () => {
  it("never returns an unpublished course, whatever the filter", async () => {
    for (const filters of [
      {},
      { price: "free" as const },
      { level: "BEGINNER" as const },
      { query: "catalog-draft" },
    ]) {
      expect(mine(await listPublishedCourses(filters))).not.toContain(draftId);
    }
  });

  it("treats only a zero-priced course as free", async () => {
    const free = mine(await listPublishedCourses({ price: "free" }));
    expect(free).toContain(freeId);
    expect(free).not.toContain(paidCheapId);

    const paid = mine(await listPublishedCourses({ price: "paid" }));
    expect(paid).toContain(paidCheapId);
    expect(paid).not.toContain(freeId);
  });

  it("does not call a course free because one of its currencies is zero", async () => {
    // Free means every active price is zero, matching isFreeCourse. A rule that
    // asked "is any price zero" would put this course in the free list while the
    // landing page charged 49 dollars for it — the disagreement that produced a
    // Free label above a button that silently did nothing.
    const free = mine(await listPublishedCourses({ price: "free" }));
    expect(free).not.toContain(mixedPriceId);

    const paid = mine(await listPublishedCourses({ price: "paid" }));
    expect(paid).toContain(mixedPriceId);
  });

  it("filters by language and by minimum rating", async () => {
    expect(mine(await listPublishedCourses({ language: "fr" }))).toEqual([frenchId]);

    const wellRated = mine(await listPublishedCourses({ minRating: 4 }));
    expect(wellRated).toEqual(expect.arrayContaining([freeId, paidDearId]));
    expect(wellRated).not.toContain(paidCheapId);
  });

  it("includes a subcategory's courses when filtering by its parent subject", async () => {
    // Both read paths: the plain Prisma query and the full-text SQL one.
    expect(mine(await listPublishedCourses({ categorySlug: `subject-${run}` }))).toEqual([childCategoryCourseId]);
    expect(mine(await listPublishedCourses({ categorySlug: `topic-${run}` }))).toEqual([childCategoryCourseId]);
    expect(
      mine(await listPublishedCourses({ categorySlug: `subject-${run}`, query: "catalog-child" })),
    ).toEqual([childCategoryCourseId]);
  });

  it("searches the instructor's name, not just the course text", async () => {
    const found = mine(await listPublishedCourses({ query: `Catalog Instructor ${run}` }));
    expect(found.length).toBeGreaterThan(0);
  });

  it("finds a published course by a title token", async () => {
    const found = mine(await listPublishedCourses({ query: "catalog-dear" }));
    expect(found).toContain(paidDearId);
  });
});

describe("sort", () => {
  it("orders by price in both directions", async () => {
    const low = mine(await listPublishedCourses({ sort: "price-low", price: "paid" }));
    const high = mine(await listPublishedCourses({ sort: "price-high", price: "paid" }));

    expect(low.indexOf(paidCheapId)).toBeLessThan(low.indexOf(paidDearId));
    expect(high.indexOf(paidDearId)).toBeLessThan(high.indexOf(paidCheapId));
  });

  it("orders by enrollment count and by rating", async () => {
    // Scope to this run: a 0-enrollment fixture otherwise falls off page 1 of
    // a shared catalog larger than CATALOG_PAGE_SIZE.
    const popular = mine(await listPublishedCourses({ sort: "popular", query: run }));
    expect(popular.indexOf(paidDearId)).toBeLessThan(popular.indexOf(paidCheapId));

    const rated = mine(await listPublishedCourses({ sort: "rating", query: run }));
    expect(rated.indexOf(paidDearId)).toBeLessThan(rated.indexOf(paidCheapId));
  });
});

describe("bounds", () => {
  it("caps the public catalog read and reports a real total", async () => {
    const all = await listPublishedCourses();
    expect(all.items.length).toBeLessThanOrEqual(CATALOG_PAGE_SIZE);
    expect(all.total).toBeGreaterThanOrEqual(all.items.length);
    expect(all.page).toBe(1);
  });

  it("keeps a title match when paging rather than dropping it behind a silent cap", async () => {
    const first = await listPublishedCourses({ query: "catalog-dear", page: 1 });
    expect(mine(first)).toContain(paidDearId);
    expect(first.total).toBeGreaterThanOrEqual(1);
    expect(first.items.length).toBeLessThanOrEqual(first.total);
  });
});
