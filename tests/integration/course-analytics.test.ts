import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Course analytics count active enrollments from the tables themselves:
 * weeks and months zero-filled in Dhaka time, refunds left out, and each
 * item's "finished by" in course order.
 */

const { db } = await import("@/lib/db");
const { getCourseAnalytics } = await import("@/lib/course-analytics");

const run = randomUUID().slice(0, 8);
// Thursday 25 September 2026, midday in Dhaka.
const NOW = new Date("2026-09-25T06:00:00Z");
let instructorId: string;
let courseId: string;
const learnerIds: string[] = [];
const itemIds: string[] = [];

beforeAll(async () => {
  instructorId = (
    await db.user.create({ data: { name: `An ${run}`, email: `an-teacher-${run}@example.test` }, select: { id: true } })
  ).id;
  courseId = (
    await db.course.create({
      data: { title: `Analytics ${run}`, slug: `analytics-${run}`, status: "PUBLISHED", publishedAt: NOW, instructorId },
      select: { id: true },
    })
  ).id;
  const section = await db.section.create({ data: { courseId, title: "Start", position: 0 }, select: { id: true } });
  for (const [position, title] of ["One", "Two", "Three"].entries()) {
    const item = await db.curriculumItem.create({
      data: {
        sectionId: section.id,
        title,
        type: "LECTURE",
        position,
        lecture: { create: { contentType: "ARTICLE", articleBody: "x", durationSeconds: 60 } },
      },
      select: { id: true },
    });
    itemIds.push(item.id);
  }

  // Four learners: two this week, one two weeks ago (Sunday night in Dhaka, which
  // is still Sunday in UTC too), one last week who was then refunded.
  const enrolments: { at: string; revoked?: boolean; finished: number }[] = [
    { at: "2026-09-22T04:00:00Z", finished: 3 },
    { at: "2026-09-24T04:00:00Z", finished: 1 },
    { at: "2026-09-13T17:30:00Z", finished: 2 }, // 23:30 Sunday in Dhaka: the week of 7 Sep
    { at: "2026-09-16T04:00:00Z", revoked: true, finished: 3 },
  ];
  for (const [index, row] of enrolments.entries()) {
    const userId = (
      await db.user.create({ data: { name: `L${index} ${run}`, email: `an-l${index}-${run}@example.test` }, select: { id: true } })
    ).id;
    learnerIds.push(userId);
    await db.enrollment.create({
      data: { userId, courseId, source: "GRANT", enrolledAt: new Date(row.at), revokedAt: row.revoked ? NOW : null },
    });
    for (const itemId of itemIds.slice(0, row.finished)) {
      await db.itemProgress.create({ data: { userId, curriculumItemId: itemId, completedAt: NOW } });
    }
    if (row.finished === 3) {
      await db.courseProgress.create({ data: { userId, courseId, percent: 100, completedAt: NOW } });
    }
  }
  await db.review.create({ data: { userId: learnerIds[0]!, courseId, rating: 5, createdAt: new Date("2026-09-23T04:00:00Z") } });
  await db.review.create({ data: { userId: learnerIds[1]!, courseId, rating: 4, createdAt: new Date("2026-07-10T04:00:00Z") } });
  await db.review.create({
    data: { userId: learnerIds[2]!, courseId, rating: 1, status: "HIDDEN", createdAt: new Date("2026-09-20T04:00:00Z") },
  });
});

afterAll(async () => {
  await db.review.deleteMany({ where: { courseId } });
  await db.courseProgress.deleteMany({ where: { courseId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [instructorId, ...learnerIds] } } });
  await db.$disconnect();
});

describe("getCourseAnalytics", () => {
  it("counts active learners and completions, leaving the refunded one out", async () => {
    const data = await getCourseAnalytics(courseId, NOW);
    expect(data.learners).toBe(3);
    expect(data.completed).toBe(1);
    expect(data.enrolledLast30Days).toBe(3);
  });

  it("buckets enrollments into zero-filled Dhaka weeks, oldest first", async () => {
    const { weeks } = await getCourseAnalytics(courseId, NOW);
    expect(weeks).toHaveLength(12);
    expect(weeks.slice(-3).map((week) => [week.start, week.enrollments])).toEqual([
      ["2026-09-07", 1],
      ["2026-09-14", 0],
      ["2026-09-21", 2],
    ]);
    expect(weeks.slice(0, -3).every((week) => week.enrollments === 0)).toBe(true);
  });

  it("averages visible ratings by month and overall", async () => {
    const data = await getCourseAnalytics(courseId, NOW);
    expect(data.ratingCount).toBe(2);
    expect(data.ratingAverage).toBe(4.5);
    const byMonth = Object.fromEntries(data.ratingMonths.map((month) => [month.month, [month.average, month.count]]));
    expect(byMonth["2026-09"]).toEqual([5, 1]);
    expect(byMonth["2026-08"]).toEqual([null, 0]);
    expect(byMonth["2026-07"]).toEqual([4, 1]);
  });

  it("lists each item in course order with how many active learners finished it", async () => {
    const { items } = await getCourseAnalytics(courseId, NOW);
    expect(items.map((item) => [item.title, item.completed])).toEqual([
      ["One", 3],
      ["Two", 2],
      ["Three", 1],
    ]);
  });
});
