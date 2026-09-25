import { db } from "@/lib/db";

/**
 * Who may watch a course's promo video: anyone once the course is published;
 * before that, its instructor and admins. Null when there is no ready promo or
 * the viewer may not see it.
 */
export async function resolvePromoVideo(
  userId: string | null,
  courseId: string,
): Promise<{ assetId: string; providerAssetId: string } | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      status: true,
      instructorId: true,
      promoVideo: {
        select: {
          id: true,
          status: true,
          providerAssetId: true,
        },
      },
    },
  });
  const asset = course?.promoVideo;
  if (!course || !asset || asset.status !== "READY" || !asset.providerAssetId) return null;
  if (course.status !== "PUBLISHED") {
    if (!userId) return null;
    if (course.instructorId !== userId) {
      const admin = await db.userRole.findUnique({ where: { userId_role: { userId, role: "ADMIN" } }, select: { role: true } });
      if (!admin) return null;
    }
  }
  return { assetId: asset.id, providerAssetId: asset.providerAssetId };
}
