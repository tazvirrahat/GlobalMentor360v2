import type { ModuleSection } from "@/lib/course-module";
import { db } from "@/lib/db";
import { getMyLearning } from "@/lib/my-learning";
import { getPlayerCourse } from "@/lib/progress";

/**
 * Where "Resume" and /learn/[slug] send a learner: the first open lesson not
 * yet done, else the first open lesson (a finished course reopens at the start).
 */
export function pickResumeItem(items: readonly { id: string; locked: boolean; completed: boolean }[]): string | null {
  return (
    items.find((item) => !item.locked && !item.completed)?.id ?? items.find((item) => !item.locked)?.id ?? null
  );
}

export type ContinueLearning = {
  course: { title: string; slug: string; percent: number; done: number; total: number };
  sections: ModuleSection[];
  currentId: string;
};

/**
 * The course a learner touched most recently and has not finished, with its
 * lessons around their place, for the "Continue learning" card on the home
 * page and the dashboard. Null when nothing is in progress.
 */
export async function getContinueLearning(userId: string): Promise<ContinueLearning | null> {
  const { inProgress } = await getMyLearning(userId);
  if (inProgress.length === 0) return null;

  const touched = await db.courseProgress.findMany({
    where: { userId, courseId: { in: inProgress.map((entry) => entry.courseId) } },
    select: { courseId: true, updatedAt: true },
  });
  const lastTouched = new Map(touched.map((row) => [row.courseId, row.updatedAt.getTime()]));
  const latest = [...inProgress].sort(
    (a, b) =>
      (lastTouched.get(b.courseId) ?? b.enrolledAt.getTime()) -
      (lastTouched.get(a.courseId) ?? a.enrolledAt.getTime()),
  )[0]!;

  const course = await getPlayerCourse(latest.slug, userId);
  if (!course || !course.enrolled) return null;

  const flat = course.sections.flatMap((section) => section.items);
  const currentId = pickResumeItem(flat);
  if (!currentId) return null;

  return {
    course: {
      title: course.title,
      slug: course.slug,
      percent: course.percent,
      done: flat.filter((item) => item.completed).length,
      total: flat.length,
    },
    currentId,
    sections: course.sections.map((section) => ({
      id: section.id,
      title: section.title,
      items: section.items.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        isPreview: item.isPreview,
        contentType: item.lecture?.contentType ?? null,
        durationSeconds: item.lecture?.durationSeconds || null,
        completed: item.completed,
        locked: item.locked,
      })),
    })),
  };
}
