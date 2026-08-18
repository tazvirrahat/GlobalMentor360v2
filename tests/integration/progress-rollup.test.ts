import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { grantEnrollment } from "@/lib/enrollment";
import { getMyLearning } from "@/lib/my-learning";
import { getPlayerCourse, recomputeCourseProgress } from "@/lib/progress";

/**
 * The player and dashboard must show item completion, not a leftover
 * CourseProgress row. Seed (and curriculum rewrite) can delete sections while
 * leaving percent=75 with zero item_progress — the UI then says 75% while
 * later lessons stay locked.
 */

const run = randomUUID().slice(0, 8);
let instructorId: string;
let learnerId: string;
let courseId: string;
let slug: string;

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: {
        name: `Rollup Instructor ${run}`,
        email: `rollup-instructor-${run}@example.test`,
      },
      select: { id: true },
    })
  ).id;

  learnerId = (
    await db.user.create({
      data: {
        name: `Rollup Learner ${run}`,
        email: `rollup-learner-${run}@example.test`,
      },
      select: { id: true },
    })
  ).id;

  slug = `rollup-course-${run}`;
  const course = await db.course.create({
    data: {
      title: `Rollup Course ${run}`,
      slug,
      status: "PUBLISHED",
      instructorId,
      publishedAt: new Date(),
      sections: {
        create: {
          title: "Getting started",
          position: 0,
          items: {
            create: [
              {
                type: "LECTURE",
                title: "One",
                position: 0,
                isPreview: true,
                lecture: { create: { contentType: "ARTICLE", articleBody: "A", durationSeconds: 60 } },
              },
              {
                type: "LECTURE",
                title: "Two",
                position: 1,
                lecture: { create: { contentType: "ARTICLE", articleBody: "B", durationSeconds: 60 } },
              },
              {
                type: "LECTURE",
                title: "Three",
                position: 2,
                lecture: { create: { contentType: "ARTICLE", articleBody: "C", durationSeconds: 60 } },
              },
              {
                type: "LECTURE",
                title: "Four",
                position: 3,
                lecture: { create: { contentType: "ARTICLE", articleBody: "D", durationSeconds: 60 } },
              },
            ],
          },
        },
      },
    },
    select: { id: true },
  });
  courseId = course.id;

  await grantEnrollment(learnerId, courseId, "GRANT");
  await db.courseProgress.upsert({
    where: { userId_courseId: { userId: learnerId, courseId } },
    update: { percent: 75, completedAt: null },
    create: { userId: learnerId, courseId, percent: 75 },
  });
});

afterAll(async () => {
  await db.certificate.deleteMany({ where: { courseId } });
  await db.itemProgress.deleteMany({ where: { userId: learnerId } });
  await db.courseProgress.deleteMany({ where: { userId: learnerId } });
  await db.analyticsEvent.deleteMany({ where: { userId: { in: [learnerId, instructorId] } } });
  await db.notification.deleteMany({ where: { userId: { in: [learnerId, instructorId] } } });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [learnerId, instructorId] } } });
  await db.$disconnect();
});

describe("stale CourseProgress rollup", () => {
  it("player percent follows item completion, not a leftover 75%", async () => {
    const player = await getPlayerCourse(slug, learnerId);
    expect(player).not.toBeNull();
    expect(player!.percent).toBe(0);
    expect(player!.sections.flatMap((section) => section.items).filter((item) => item.locked)).toHaveLength(
      3,
    );
  });

  it("My Learning reads the CourseProgress rollup plus item counts, not a player payload", async () => {
    const learning = await getMyLearning(learnerId);
    expect(learning.inProgress).toHaveLength(1);
    expect(learning.inProgress[0]!.percent).toBe(75);
    expect(learning.inProgress[0]!.itemCount).toBe(4);
    expect(learning.inProgress[0]!.thumbnailUrl).toBeNull();
    expect(learning.completed).toHaveLength(0);
  });

  it("keeps My Learning in sync after a write-path recompute", async () => {
    await recomputeCourseProgress(learnerId, courseId);
    const player = await getPlayerCourse(slug, learnerId);
    const learning = await getMyLearning(learnerId);
    expect(learning.inProgress[0]!.percent).toBe(player!.percent);
    expect(learning.inProgress[0]!.percent).toBe(0);
  });

  it("heals a missing certificate when the rollup is already 100%", async () => {
    const items = await db.curriculumItem.findMany({
      where: { section: { courseId } },
      select: { id: true },
    });
    for (const item of items) {
      await db.itemProgress.upsert({
        where: { userId_curriculumItemId: { userId: learnerId, curriculumItemId: item.id } },
        update: { completedAt: new Date() },
        create: { userId: learnerId, curriculumItemId: item.id, completedAt: new Date() },
      });
    }
    await db.courseProgress.upsert({
      where: { userId_courseId: { userId: learnerId, courseId } },
      update: { percent: 100, completedAt: new Date() },
      create: { userId: learnerId, courseId, percent: 100, completedAt: new Date() },
    });

    const before = await db.certificate.findUnique({
      where: { userId_courseId: { userId: learnerId, courseId } },
    });
    expect(before).toBeNull();

    const player = await getPlayerCourse(slug, learnerId);
    expect(player!.percent).toBe(100);
    expect(player!.certificateSerial).not.toBeNull();

    const learning = await getMyLearning(learnerId);
    expect(learning.completed).toHaveLength(1);
    expect(learning.completed[0]!.certificateSerial).toBe(player!.certificateSerial);
  });
});
