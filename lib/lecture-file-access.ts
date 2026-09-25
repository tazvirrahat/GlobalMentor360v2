import { db } from "@/lib/db";
import { LECTURE_FILE_PROVIDER, lectureFileName } from "@/lib/lecture-files";
import { canAccessItemMedia } from "@/lib/progress";

/**
 * Who may open an audio or PDF lesson's file: exactly who may open the
 * lecture's media (canAccessItemMedia — enrolled and unlocked in order, or a
 * free preview). Null means "not found" to the caller either way.
 */
export async function resolveLectureFile(
  userId: string | null,
  itemId: string,
): Promise<{ kind: "AUDIO" | "FILE"; key: string; filename: string } | null> {
  const lecture = await db.lecture.findUnique({
    where: { curriculumItemId: itemId },
    select: { contentType: true, asset: { select: { provider: true, originalKey: true, status: true } } },
  });
  if (!lecture || (lecture.contentType !== "AUDIO" && lecture.contentType !== "FILE")) return null;
  const asset = lecture.asset;
  if (!asset || asset.provider !== LECTURE_FILE_PROVIDER || !asset.originalKey || asset.status !== "READY") return null;
  if (!(await canAccessItemMedia(userId, itemId))) return null;
  return { kind: lecture.contentType, key: asset.originalKey, filename: lectureFileName(asset.originalKey) };
}
