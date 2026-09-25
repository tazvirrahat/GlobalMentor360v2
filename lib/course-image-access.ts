import { isCourseImageKey } from "@/lib/course-image";
import { db } from "@/lib/db";

/**
 * Who may see a course's image: anyone once the course is published; before
 * that, its instructor and admins (who review it). Null means "not found" to
 * the caller, whether there is no image or the viewer may not see it.
 */
export async function resolveCourseImage(
  userId: string | null,
  courseId: string,
): Promise<{ key: string; isPublic: boolean } | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { status: true, instructorId: true, thumbnailUrl: true },
  });
  if (!course?.thumbnailUrl || !isCourseImageKey(course.thumbnailUrl, courseId)) return null;
  if (course.status === "PUBLISHED") return { key: course.thumbnailUrl, isPublic: true };
  if (!userId) return null;
  if (course.instructorId === userId) return { key: course.thumbnailUrl, isPublic: false };
  const admin = await db.userRole.findUnique({
    where: { userId_role: { userId, role: "ADMIN" } },
    select: { role: true },
  });
  return admin ? { key: course.thumbnailUrl, isPublic: false } : null;
}
