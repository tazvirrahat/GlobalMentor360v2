import { db } from "@/lib/db";

/**
 * Best-effort cleanup after a lecture no longer points at this MediaAsset.
 *
 * Skips S3 and the row when another lecture still references it, or when a
 * Course.promoVideoId points at it (that FK has no ON DELETE, so a delete
 * would fail — promo videos are not part of the lecture-asset cleanup path).
 * S3 errors must not block the instructor action.
 */
export async function releaseOrphanedLectureAsset(asset: {
  id: string;
  providerAssetId: string | null;
}): Promise<void> {
  const [lectureRefs, promoRefs] = await Promise.all([
    db.lecture.count({ where: { assetId: asset.id } }),
    db.course.count({ where: { promoVideoId: asset.id } }),
  ]);

  if (lectureRefs > 0 || promoRefs > 0) return;

  if (asset.providerAssetId) {
    try {
      const { video } = await import("@/lib/video");
      await video.deleteAsset(asset.providerAssetId);
    } catch (error) {
      console.error("video.deleteAsset failed during lecture cleanup", error);
    }
  }

  try {
    await db.mediaAsset.delete({ where: { id: asset.id } });
  } catch (error) {
    console.error("mediaAsset.delete failed during lecture cleanup", error);
  }
}
