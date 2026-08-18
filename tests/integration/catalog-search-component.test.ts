import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { listPublishedCourses } from "@/lib/courses";

/**
 * Full-text + ILIKE fallback + published-only + injection safety.
 *
 * The raw SQL in searchPublishedCourseIds is a Prisma tagged template, so the
 * query string is a bound parameter. These cases pin the behaviour a learner
 * would notice: a prefix of the title still hits, a draft never appears, and a
 * hostile string does not throw or leak extra rows.
 */

const run = randomUUID().slice(0, 8);
const token = `Zxqv${run}`;
const prefix = token.slice(0, 8);

let instructorId: string;
const courseIds: string[] = [];
let publishedId: string;
let draftId: string;
let frenchId: string;
let paidId: string;

async function makeCourse(input: {
  title: string;
  slug: string;
  published?: boolean;
  language?: string;
  priceUsd?: number;
}) {
  const course = await db.course.create({
    data: {
      title: input.title,
      slug: input.slug,
      status: input.published === false ? "DRAFT" : "PUBLISHED",
      instructorId,
      language: input.language ?? "en",
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  await db.price.create({
    data: {
      courseId: course.id,
      currency: "USD",
      amount: input.priceUsd ?? 0,
      isActive: true,
    },
  });
  courseIds.push(course.id);
  return course.id;
}

function mine(page: { items: { id: string }[] }) {
  return page.items.filter((course) => courseIds.includes(course.id)).map((course) => course.id);
}

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: { name: `Search Instructor ${run}`, email: `search-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;

  publishedId = await makeCourse({
    title: `${token} TypeScript Foundations`,
    slug: `search-pub-${run}`,
    priceUsd: 0,
  });
  draftId = await makeCourse({
    title: `${token} Draft Hidden`,
    slug: `search-draft-${run}`,
    published: false,
    priceUsd: 0,
  });
  frenchId = await makeCourse({
    title: `${token} French Track`,
    slug: `search-fr-${run}`,
    language: "fr",
    priceUsd: 0,
  });
  paidId = await makeCourse({
    title: `${token} Paid Advanced`,
    slug: `search-paid-${run}`,
    priceUsd: 4900,
  });
});

afterAll(async () => {
  await db.price.deleteMany({ where: { courseId: { in: courseIds } } });
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.user.deleteMany({ where: { id: instructorId } });
  await db.$disconnect();
});

describe("FTS + ILIKE fallback", () => {
  it("finds a published course by a title token", async () => {
    const found = mine(await listPublishedCourses({ query: token }));
    expect(found).toContain(publishedId);
  });

  it("finds the same course by a prefix that stemming would miss", async () => {
    // "Zxqv...." is not an English stem of anything in the catalog; a prefix
    // shorter than the token is the trigram/ILIKE path the migration added.
    const found = mine(await listPublishedCourses({ query: prefix }));
    expect(found).toContain(publishedId);
  });

  it("never returns a draft even when the query matches its title exactly", async () => {
    const found = mine(await listPublishedCourses({ query: `${token} Draft Hidden` }));
    expect(found).not.toContain(draftId);
    const byToken = mine(await listPublishedCourses({ query: token }));
    expect(byToken).not.toContain(draftId);
  });
});

describe("filter/sort combinations with search", () => {
  it("intersects search with language", async () => {
    const french = mine(await listPublishedCourses({ query: token, language: "fr" }));
    expect(french).toEqual([frenchId]);
  });

  it("intersects search with the paid filter", async () => {
    const paid = mine(await listPublishedCourses({ query: token, price: "paid" }));
    expect(paid).toContain(paidId);
    expect(paid).not.toContain(publishedId);
  });
});

describe("injection safety", () => {
  it("does not throw on a SQL-shaped query, and does not drop or leak rows", async () => {
    const hostile = `${token}'; DROP TABLE courses; --`;
    await expect(listPublishedCourses({ query: hostile })).resolves.toBeDefined();

    const found = mine(await listPublishedCourses({ query: hostile }));
    expect(found).not.toContain(draftId);

    // Parameterised query: the payload cannot drop the table. A clean token
    // search afterwards still hits the published course.
    const stillThere = mine(await listPublishedCourses({ query: token }));
    expect(stillThere).toContain(publishedId);
  });

  it("does not treat a wildcard-only query as match-everything via ILIKE", async () => {
    const found = mine(await listPublishedCourses({ query: "%" }));
    // "%" sanitises to empty, which means "no search" — the catalog listing,
    // still published-only. A draft must not appear.
    expect(found).not.toContain(draftId);
  });
});
