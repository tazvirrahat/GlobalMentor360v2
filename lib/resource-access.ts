import { db } from "@/lib/db";
import { canAccessItemMedia } from "@/lib/progress";

/**
 * Who may open a lecture resource: exactly who may open the lecture's media —
 * enrolled learners, or anyone for a free-preview lecture, respecting the
 * quiz gate (canAccessItemMedia, the same check as video and captions).
 * Null means "not found" to the caller, whether the resource is missing or
 * the viewer may not see it, so the response never confirms it exists.
 */
export async function resolveResourceDownload(
  userId: string | null,
  resourceId: string,
): Promise<{ kind: "file"; key: string; filename: string } | { kind: "link"; url: string } | null> {
  const resource = await db.lectureResource.findUnique({
    where: { id: resourceId },
    select: {
      filename: true,
      storageKey: true,
      externalUrl: true,
      isDownloadable: true,
      lecture: { select: { curriculumItemId: true } },
    },
  });
  if (!resource) return null;
  if (!(await canAccessItemMedia(userId, resource.lecture.curriculumItemId))) return null;

  if (resource.externalUrl) return { kind: "link", url: resource.externalUrl };
  if (!resource.storageKey || !resource.isDownloadable) return null;
  return { kind: "file", key: resource.storageKey, filename: resource.filename };
}
