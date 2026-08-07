import { db } from "@/lib/db";

/**
 * Read model for the learner dashboard ("My Learning").
 *
 * Entitlement is the Enrollment row (invariant 1): only active enrollments
 * (revokedAt null) are returned. Progress comes from the CourseProgress rollup
 * and defaults to 0 when no row exists yet.
 */

export type MyLearningEntry = {
  courseId: string;
  title: string;
  slug: string;
  subtitle: string | null;
  level: string;
  instructorName: string;
  categoryName: string | null;
  enrolledAt: Date;
  /** 0–100, from the CourseProgress rollup; 0 when absent. */
  percent: number;
  completedAt: Date | null;
  certificateSerial: string | null;
};

export type MyLearning = {
  inProgress: MyLearningEntry[];
  completed: MyLearningEntry[];
  archived: MyLearningEntry[];
};

export async function getMyLearning(userId: string): Promise<MyLearning> {
  const enrollments = await db.enrollment.findMany({
    where: { userId, revokedAt: null },
    orderBy: { enrolledAt: "desc" },
    select: {
      enrolledAt: true,
      archivedAt: true,
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          subtitle: true,
          level: true,
          instructor: { select: { name: true } },
          primaryCategory: { select: { name: true } },
        },
      },
    },
  });

  if (enrollments.length === 0) {
    return { inProgress: [], completed: [], archived: [] };
  }

  const courseIds = enrollments.map((enrollment) => enrollment.course.id);
  const [progressRows, certificates] = await Promise.all([
    db.courseProgress.findMany({
      where: { userId, courseId: { in: courseIds } },
      select: { courseId: true, percent: true, completedAt: true },
    }),
    db.certificate.findMany({
      where: { userId, courseId: { in: courseIds } },
      select: { courseId: true, serial: true },
    }),
  ]);

  const progressByCourse = new Map(progressRows.map((row) => [row.courseId, row]));
  const serialByCourse = new Map(certificates.map((row) => [row.courseId, row.serial]));

  const entries = enrollments.map((enrollment) => {
    const progress = progressByCourse.get(enrollment.course.id);
    const entry: MyLearningEntry = {
      courseId: enrollment.course.id,
      title: enrollment.course.title,
      slug: enrollment.course.slug,
      subtitle: enrollment.course.subtitle,
      level: enrollment.course.level,
      instructorName: enrollment.course.instructor.name,
      categoryName: enrollment.course.primaryCategory?.name ?? null,
      enrolledAt: enrollment.enrolledAt,
      percent: Math.round(progress?.percent ?? 0),
      completedAt: progress?.completedAt ?? null,
      certificateSerial: serialByCourse.get(enrollment.course.id) ?? null,
    };
    return { entry, archived: enrollment.archivedAt !== null };
  });

  return {
    inProgress: entries
      .filter(({ entry, archived }) => !archived && entry.percent < 100)
      .map(({ entry }) => entry),
    completed: entries
      .filter(({ entry, archived }) => !archived && entry.percent >= 100)
      .map(({ entry }) => entry),
    archived: entries.filter(({ archived }) => archived).map(({ entry }) => entry),
  };
}
