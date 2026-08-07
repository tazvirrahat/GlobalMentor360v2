import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { video, VideoProviderError } from "@/lib/video";

/**
 * Receives MediaConvert job state changes forwarded by an EventBridge API
 * destination. Authentication is the provider's job (shared-secret header,
 * constant-time compare); this route only translates a verified event into
 * MediaAsset / Lecture updates.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let event;
  try {
    event = video.verifyWebhook(rawBody, headers);
  } catch (error) {
    if (error instanceof VideoProviderError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  if (!event) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const asset = await db.mediaAsset.findUnique({
    where: { providerAssetId: event.providerAssetId },
    select: { id: true, status: true },
  });

  // 200, not 404 — an event for an asset we never created (or already deleted)
  // will never become handleable, so retries would just be noise.
  if (!asset) {
    return Response.json({ ok: true, ignored: true });
  }

  // EventBridge delivery is unordered; a late PROGRESSING must not regress a
  // row that already reached a terminal state.
  const terminal = asset.status === "READY" || asset.status === "FAILED";
  if (terminal && event.status === "PROCESSING") {
    return Response.json({ ok: true });
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

  // Refresh the studio curriculum pages that show this asset's status.
  const lectures = await db.lecture.findMany({
    where: { assetId: asset.id },
    select: { curriculumItem: { select: { section: { select: { courseId: true } } } } },
  });
  for (const lecture of lectures) {
    revalidatePath(`/studio/courses/${lecture.curriculumItem.section.courseId}/curriculum`);
  }

  return Response.json({ ok: true });
}
