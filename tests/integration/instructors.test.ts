import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Public instructor pages: only published courses count, a hidden profile is a
 * 404, and the rating is weighted by how many people rated each course.
 */

const { db } = await import("@/lib/db");
const { ensureInstructorSlug, getInstructorProfile } = await import("@/lib/instructors");
const { grantEnrollment, revokeEnrollment } = await import("@/lib/enrollment");

const run = randomUUID().slice(0, 8);
let teacherId: string;
let quietId: string;
const courseIds: string[] = [];
const learnerIds: string[] = [];

async function course(label: string, instructorId: string, data: Record<string, unknown>) {
  const row = await db.course.create({
    data: { title: `${label} ${run}`, slug: `${label}-${run}`, instructorId, ...data },
    select: { id: true },
  });
  courseIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  teacherId = (
    await db.user.create({
      data: { name: `Teacher ${run}`, email: `teacher-${run}@example.test`, headline: "Teaches things" },
      select: { id: true },
    })
  ).id;
  quietId = (
    await db.user.create({
      data: { name: `Quiet ${run}`, email: `quiet-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  // 4.0 from 10 ratings and 5.0 from 30: weighted 4.75, not the plain 4.5.
  const aId = await course("prof-a", teacherId, { status: "PUBLISHED", publishedAt: new Date(), ratingAverage: 4, ratingCount: 10, enrollmentCount: 12 });
  const bId = await course("prof-b", teacherId, { status: "PUBLISHED", publishedAt: new Date(), ratingAverage: 5, ratingCount: 30, enrollmentCount: 40 });
  await course("prof-draft", teacherId, { status: "DRAFT", ratingAverage: 1, ratingCount: 100, enrollmentCount: 999 });
  await course("prof-quiet-draft", quietId, { status: "DRAFT" });

  // Three people: one in both courses, one in one, one refunded.
  for (const label of ["both", "one", "refunded"]) {
    learnerIds.push(
      (
        await db.user.create({
          data: { name: `L ${label} ${run}`, email: `prof-l-${label}-${run}@example.test` },
          select: { id: true },
        })
      ).id,
    );
  }
  const [both, one, refunded] = learnerIds as [string, string, string];
  await grantEnrollment(both, aId, "GRANT");
  await grantEnrollment(both, bId, "GRANT");
  await grantEnrollment(one, aId, "GRANT");
  await grantEnrollment(refunded, bId, "GRANT");
  await revokeEnrollment(refunded, bId);
});

afterAll(async () => {
  await db.analyticsEvent.deleteMany({ where: { userId: { in: learnerIds } } });
  await db.notification.deleteMany({ where: { userId: { in: learnerIds } } });
  await db.courseProgress.deleteMany({ where: { courseId: { in: courseIds } } });
  await db.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
  await db.course.deleteMany({ where: { id: { in: courseIds } } });
  await db.user.deleteMany({ where: { id: { in: [teacherId, quietId, ...learnerIds] } } });
  await db.$disconnect();
});

describe("instructor profiles", () => {
  it("gives an instructor a unique slug once", async () => {
    const slug = await ensureInstructorSlug(teacherId);
    expect(slug).toBe(`teacher-${run}`);
    expect(await ensureInstructorSlug(teacherId)).toBe(slug);
  });

  it("counts only published courses and weights the rating by ratings", async () => {
    const profile = await getInstructorProfile(`teacher-${run}`);
    expect(profile).not.toBeNull();
    expect(profile!.courseCount).toBe(2);
    // Distinct live learners: "both" once, "one", and not the refunded one.
    expect(profile!.learnerCount).toBe(2);
    expect(profile!.ratingCount).toBe(40);
    expect(profile!.ratingAverage).toBeCloseTo(4.75, 5);
    expect(profile!.courses.map((row) => row.slug)).not.toContain(`prof-draft-${run}`);
  });

  it("is a 404 when hidden, unknown, or with nothing published", async () => {
    await db.user.update({ where: { id: teacherId }, data: { profilePublic: false } });
    expect(await getInstructorProfile(`teacher-${run}`)).toBeNull();
    await db.user.update({ where: { id: teacherId }, data: { profilePublic: true } });

    expect(await getInstructorProfile(`nobody-${run}`)).toBeNull();
    const quietSlug = await ensureInstructorSlug(quietId);
    expect(await getInstructorProfile(quietSlug)).toBeNull();
  });
});
