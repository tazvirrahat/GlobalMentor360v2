import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * "Highest rated" ranks by a recency-weighted score while the displayed
 * average stays the flat mean: two courses with the same 3.0 average rank by
 * which one's recent learners liked it.
 */

const { db } = await import("@/lib/db");
const { recomputeCourseRating } = await import("@/lib/reviews");
const { listPublishedCourses } = await import("@/lib/courses");

const run = randomUUID().slice(0, 8);
const YEARS_AGO = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);
let instructorId: string;
const courses: Record<"fading" | "rising", string> = { fading: "", rising: "" };
const reviewers: string[] = [];

async function review(courseId: string, rating: number, updatedAt: Date) {
  const userId = (
    await db.user.create({ data: { name: `Rv ${reviewers.length} ${run}`, email: `rs-${reviewers.length}-${run}@example.test` }, select: { id: true } })
  ).id;
  reviewers.push(userId);
  const row = await db.review.create({ data: { userId, courseId, rating }, select: { id: true } });
  await db.$executeRaw`UPDATE reviews SET "updatedAt" = ${updatedAt}, "createdAt" = ${updatedAt} WHERE id = ${row.id}`;
}

beforeAll(async () => {
  instructorId = (await db.user.create({ data: { name: `Rs ${run}`, email: `rs-teacher-${run}@example.test` }, select: { id: true } })).id;
  for (const label of ["fading", "rising"] as const) {
    courses[label] = (
      await db.course.create({
        data: { title: `Score ${label} ${run}`, slug: `score-${label}-${run}`, status: "PUBLISHED", publishedAt: new Date(), instructorId },
        select: { id: true },
      })
    ).id;
  }
  // Same flat average (3.0); the praise is old for one and new for the other.
  await review(courses.fading, 5, YEARS_AGO);
  await review(courses.fading, 1, new Date());
  await review(courses.rising, 1, YEARS_AGO);
  await review(courses.rising, 5, new Date());
  await recomputeCourseRating(courses.fading);
  await recomputeCourseRating(courses.rising);
});

afterAll(async () => {
  await db.review.deleteMany({ where: { courseId: { in: Object.values(courses) } } });
  await db.course.deleteMany({ where: { id: { in: Object.values(courses) } } });
  await db.user.deleteMany({ where: { id: { in: [instructorId, ...reviewers] } } });
  await db.$disconnect();
});

describe("ratingScore", () => {
  it("keeps the displayed average flat and weights the score toward recent reviews", async () => {
    const rows = await db.course.findMany({
      where: { id: { in: Object.values(courses) } },
      select: { id: true, ratingAverage: true, ratingScore: true },
    });
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(byId[courses.fading]!.ratingAverage).toBe(3);
    expect(byId[courses.rising]!.ratingAverage).toBe(3);
    // Three half-lives: the old review weighs 1/8. (5·1/8 + 1) / (9/8) ≈ 1.44; (1·1/8 + 5) / (9/8) ≈ 4.56.
    expect(byId[courses.fading]!.ratingScore).toBeCloseTo(1.44, 1);
    expect(byId[courses.rising]!.ratingScore).toBeCloseTo(4.56, 1);
  });

  it("orders Highest rated by the score", async () => {
    const page = await listPublishedCourses({ sort: "rating", query: `Score` });
    const ours = page.items.map((course) => course.id).filter((id) => Object.values(courses).includes(id));
    expect(ours).toEqual([courses.rising, courses.fading]);
  });
});
