import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Archive is a filing action on My learning: it moves a course between lists
 * and never touches access. The write is scoped to the learner in its `where`.
 */

const { db } = await import("@/lib/db");
const { grantEnrollment } = await import("@/lib/enrollment");
const { isEnrolled } = await import("@/lib/entitlement");
const { getMyLearning, setCourseArchived } = await import("@/lib/my-learning");

const run = randomUUID().slice(0, 8);
let learnerId: string;
let otherId: string;
let instructorId: string;
let courseId: string;

beforeAll(async () => {
  const user = async (label: string) =>
    (
      await db.user.create({
        data: { name: `Archive ${label} ${run}`, email: `archive-${label}-${run}@example.test` },
        select: { id: true },
      })
    ).id;
  [learnerId, otherId, instructorId] = await Promise.all([user("learner"), user("other"), user("instructor")]);
  courseId = (
    await db.course.create({
      data: {
        title: `Archive Course ${run}`,
        slug: `archive-course-${run}`,
        status: "PUBLISHED",
        instructorId,
        publishedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;
  await grantEnrollment(learnerId, courseId, "GRANT");
});

afterAll(async () => {
  await db.analyticsEvent.deleteMany({ where: { userId: { in: [learnerId, otherId, instructorId] } } });
  await db.notification.deleteMany({ where: { userId: learnerId } });
  await db.courseProgress.deleteMany({ where: { courseId } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [learnerId, otherId, instructorId] } } });
  await db.$disconnect();
});

const ids = (entries: { courseId: string }[]) => entries.map((entry) => entry.courseId);

describe("setCourseArchived", () => {
  it("moves a course to Archived and back, keeping access", async () => {
    expect(ids((await getMyLearning(learnerId)).inProgress)).toContain(courseId);

    expect(await setCourseArchived(learnerId, courseId, true)).toBe(true);
    const archived = await getMyLearning(learnerId);
    expect(ids(archived.archived)).toContain(courseId);
    expect(ids(archived.inProgress)).not.toContain(courseId);
    expect(await isEnrolled(learnerId, courseId)).toBe(true);

    expect(await setCourseArchived(learnerId, courseId, false)).toBe(true);
    const back = await getMyLearning(learnerId);
    expect(ids(back.inProgress)).toContain(courseId);
    expect(ids(back.archived)).not.toContain(courseId);
  });

  it("changes nothing for someone who is not enrolled", async () => {
    expect(await setCourseArchived(otherId, courseId, true)).toBe(false);
    expect(ids((await getMyLearning(learnerId)).archived)).not.toContain(courseId);
  });
});
