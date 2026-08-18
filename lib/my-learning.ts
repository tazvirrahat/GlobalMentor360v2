import { db } from "@/lib/db";

/**
 * Read model for the learner dashboard ("My Learning").
 *
 * Entitlement is the Enrollment row (invariant 1): only active enrollments
 * (revokedAt null) are returned. Percent comes from CourseProgress, which
 * recomputeCourseProgress keeps in sync on every completion write (mark
 * complete, quiz pass, watch-to-complete). Do not rebuild a player payload
 * here — that was loading every article body and quiz prompt on the dashboard.
 */

export type MyLearningEntry = {
  courseId: string;
  title: string;
  slug: string;
  subtitle: string | null;
  level: string;
  thumbnailUrl: string | null;
  itemCount: number;
  instructorName: string;
  categoryName: string | null;
  enrolledAt: Date;
  /** 0–100, from the CourseProgress rollup kept fresh on the write path. */
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
          thumbnailUrl: true,
          instructor: { select: { name: true } },
          primaryCategory: { select: { name: true } },
          sections: { select: { _count: { select: { items: true } } } },
          courseProgress: {
            where: { userId },
            select: { percent: true, completedAt: true },
          },
        },
      },
    },
  });

  if (enrollments.length === 0) {
    return { inProgress: [], completed: [], archived: [] };
  }

  const courseIds = enrollments.map((enrollment) => enrollment.course.id);
  const certificates = await db.certificate.findMany({
    where: { userId, courseId: { in: courseIds } },
    select: { courseId: true, serial: true },
  });
  const serialByCourse = new Map(certificates.map((row) => [row.courseId, row.serial]));

  const entries = enrollments.map((enrollment) => {
    const rollup = enrollment.course.courseProgress[0];
    const itemCount = enrollment.course.sections.reduce(
      (sum, section) => sum + section._count.items,
      0,
    );
    const entry: MyLearningEntry = {
      courseId: enrollment.course.id,
      title: enrollment.course.title,
      slug: enrollment.course.slug,
      subtitle: enrollment.course.subtitle,
      level: enrollment.course.level,
      thumbnailUrl: enrollment.course.thumbnailUrl,
      itemCount,
      instructorName: enrollment.course.instructor.name,
      categoryName: enrollment.course.primaryCategory?.name ?? null,
      enrolledAt: enrollment.enrolledAt,
      percent: rollup?.percent ?? 0,
      completedAt: rollup?.completedAt ?? null,
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
