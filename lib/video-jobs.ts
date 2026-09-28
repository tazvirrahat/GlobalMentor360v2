import type { MediaStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { LECTURE_FILE_PROVIDER } from "@/lib/lecture-files";
import { drainMediaConvertEventQueue, video, VideoProviderError } from "@/lib/video";

/**
 * The video pipeline as staff see it: how many assets sit in
 * each state, which ones need a person, and the two things a person can do —
 * check an asset against the provider, or retry a failed transcode. Also the
 * reconcile the studio's "Check status" runs for an instructor's own lecture.
 * Audio and PDF lessons (provider "file") are not videos and are left out.
 */

/** Uploads or transcodes that have not moved for this long are listed as stuck. */
export const STUCK_AFTER_MS = 60 * 60 * 1000;
const ATTENTION_LIMIT = 50;

export async function videoStatusCounts(): Promise<Record<MediaStatus, number>> {
  const groups = await db.mediaAsset.groupBy({
    by: ["status"],
    where: { provider: { not: LECTURE_FILE_PROVIDER } },
    _count: { _all: true },
  });
  const counts: Record<MediaStatus, number> = { UPLOADING: 0, PROCESSING: 0, READY: 0, FAILED: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}

export type VideoJob = {
  id: string;
  status: MediaStatus;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  lecture: { itemId: string; title: string; courseId: string; courseTitle: string; instructorName: string } | null;
};

/** Failed assets, and uploads or transcodes idle for over an hour; most recently changed first. */
export async function listVideoJobsNeedingAttention(now: Date = new Date()): Promise<VideoJob[]> {
  const rows = await db.mediaAsset.findMany({
    where: {
      provider: { not: LECTURE_FILE_PROVIDER },
      OR: [
        { status: "FAILED" },
        { status: { in: ["UPLOADING", "PROCESSING"] }, updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: ATTENTION_LIMIT,
    select: {
      id: true,
      status: true,
      failureReason: true,
      createdAt: true,
      updatedAt: true,
      lectures: {
        take: 1,
        select: {
          curriculumItem: {
            select: {
              id: true,
              title: true,
              section: { select: { course: { select: { id: true, title: true, instructor: { select: { name: true } } } } } },
            },
          },
        },
      },
    },
  });
  return rows.map(({ lectures, ...row }) => {
    const item = lectures[0]?.curriculumItem;
    return {
      ...row,
      lecture: item
        ? {
            itemId: item.id,
            title: item.title,
            courseId: item.section.course.id,
            courseTitle: item.section.course.title,
            instructorName: item.section.course.instructor.name,
          }
        : null,
    };
  });
}

export type VideoJobResult = { ok: true; message: string } | { ok: false; message: string };

function providerMessage(error: unknown, fallback: string): string {
  return error instanceof VideoProviderError ? error.message : fallback;
}

/** Starts a new transcode for a failed asset whose original is still in storage. Audited. */
export async function retryVideoProcessing(adminId: string, assetId: string): Promise<VideoJobResult> {
  const asset = await db.mediaAsset.findUnique({ where: { id: assetId }, select: { status: true, providerAssetId: true } });
  if (!asset) return { ok: false, message: "That video no longer exists." };
  if (asset.status !== "FAILED") return { ok: false, message: "Only a failed video can be retried." };
  if (!asset.providerAssetId) return { ok: false, message: "This upload never reached storage. The instructor needs to upload it again." };

  try {
    await video.startProcessing(asset.providerAssetId);
  } catch (error) {
    return { ok: false, message: providerMessage(error, "Could not start processing.") };
  }
  await db.mediaAsset.update({ where: { id: assetId }, data: { status: "PROCESSING", failureReason: null } });
  await db.auditLog.create({
    data: { actorId: adminId, action: "video.retry", targetType: "media_asset", targetId: assetId, metadata: {} },
  });
  return { ok: true, message: "Processing started again." };
}

/**
 * Applies any queued MediaConvert events, then asks the provider where the
 * asset stands and stores it. S3 cannot show FAILED, and can lag an event
 * already applied, so a FAILED or READY row is never moved backwards.
 */
export async function reconcileVideoAsset(asset: {
  id: string;
  providerAssetId: string;
  status: MediaStatus;
  lectureId: string | null;
}): Promise<VideoJobResult> {
  try {
    await drainMediaConvertEventQueue();
  } catch (error) {
    // S3 still tells us READY; FAILED only arrives via SQS/webhook, so surface
    // a queue error only when we cannot even reach the provider next.
    if (!(error instanceof VideoProviderError)) throw error;
  }

  const afterEvents = await db.mediaAsset.findUnique({ where: { id: asset.id }, select: { status: true } });
  const currentStatus = afterEvents?.status ?? asset.status;

  let remote;
  try {
    remote = await video.getAsset(asset.providerAssetId);
  } catch (error) {
    return { ok: false, message: providerMessage(error, "Could not reach the video provider.") };
  }

  if (currentStatus === "FAILED" && remote.status !== "READY") {
    return { ok: true, message: "Video failed — re-upload to try again." };
  }
  if (currentStatus === "READY" && remote.status !== "READY") return { ok: true, message: "Video is ready." };

  await db.mediaAsset.update({
    where: { id: asset.id },
    data: {
      status: remote.status,
      ...(remote.durationSeconds !== null ? { durationSeconds: remote.durationSeconds } : {}),
      ...(remote.thumbnailUrl !== null ? { thumbnailUrl: remote.thumbnailUrl } : {}),
      failureReason: remote.failureReason,
    },
  });
  if (remote.status === "READY" && remote.durationSeconds !== null && asset.lectureId) {
    await db.lecture.update({ where: { id: asset.lectureId }, data: { durationSeconds: remote.durationSeconds } });
  }

  const message =
    remote.status === "READY"
      ? "Video is ready."
      : remote.status === "PROCESSING"
        ? "Still transcoding — check again in a minute."
        : remote.status === "FAILED"
          ? "Transcoding failed."
          : "Waiting for the upload to finish.";
  return { ok: true, message };
}

/** Admin "Check status" for any asset. */
export async function checkVideoAsset(assetId: string): Promise<VideoJobResult> {
  const asset = await db.mediaAsset.findUnique({
    where: { id: assetId },
    select: { id: true, providerAssetId: true, status: true, lectures: { take: 1, select: { id: true } } },
  });
  if (!asset) return { ok: false, message: "That video no longer exists." };
  if (!asset.providerAssetId) return { ok: false, message: "This upload never reached storage." };
  return reconcileVideoAsset({
    id: asset.id,
    providerAssetId: asset.providerAssetId,
    status: asset.status,
    lectureId: asset.lectures[0]?.id ?? null,
  });
}
