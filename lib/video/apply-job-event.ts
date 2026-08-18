import { db } from "@/lib/db";
import type { WebhookEvent } from "./provider";

export type ApplyJobEventOptions = {
  /** Injected in tests. Production checks S3 for hls/{assetId}/index.m3u8. */
  masterManifestExists?: (providerAssetId: string) => Promise<boolean>;
};

async function defaultMasterManifestExists(providerAssetId: string): Promise<boolean> {
  // Dynamic import avoids a cycle: aws.ts drains through this module.
  const { hlsMasterManifestExists } = await import("./aws");
  return hlsMasterManifestExists(providerAssetId);
}

/**
 * Persist a verified MediaConvert COMPLETE/ERROR (or in-progress) event onto
 * the matching MediaAsset / Lecture rows. Shared by POST /api/video/webhook
 * and the local-dev SQS drain so both paths cannot diverge.
 *
 * READY and FAILED are terminal. A late ERROR must not overwrite READY. A late
 * COMPLETE may move FAILED → READY only when the master manifest is already in
 * S3 — otherwise a reordered COMPLETE/ERROR pair would resurrect a failed job.
 *
 * Returns studio course ids that show this asset, so callers can revalidate.
 */
export async function applyMediaConvertJobEvent(
  event: WebhookEvent,
  options: ApplyJobEventOptions = {},
): Promise<string[]> {
  const asset = await db.mediaAsset.findUnique({
    where: { providerAssetId: event.providerAssetId },
    select: { id: true, status: true },
  });

  // An event for an asset we never created (or already deleted) will never
  // become handleable — ignore it the same way the webhook returns 200.
  if (!asset) return [];

  if (asset.status === "READY") {
    // Never READY → FAILED (or PROCESSING) from a late event. A duplicate
    // COMPLETE may still refresh duration.
    if (event.status !== "READY") return [];
  } else if (asset.status === "FAILED") {
    if (event.status === "PROCESSING") return [];
    if (event.status === "READY") {
      const exists = await (options.masterManifestExists ?? defaultMasterManifestExists)(
        event.providerAssetId,
      );
      if (!exists) return [];
    }
  }

  await db.mediaAsset.update({
    where: { id: asset.id },
    data: {
      status: event.status,
      failureReason: event.failureReason,
      ...(event.durationSeconds !== null ? { durationSeconds: event.durationSeconds } : {}),
    },
  });

  if (event.status === "READY" && event.durationSeconds !== null) {
    await db.lecture.updateMany({
      where: { assetId: asset.id },
      data: { durationSeconds: event.durationSeconds },
    });
  }

  const lectures = await db.lecture.findMany({
    where: { assetId: asset.id },
    select: { curriculumItem: { select: { section: { select: { courseId: true } } } } },
  });

  return [
    ...new Set(lectures.map((lecture) => lecture.curriculumItem.section.courseId)),
  ];
}
