import { revalidatePath } from "next/cache";
import { applyMediaConvertJobEvent } from "@/lib/video/apply-job-event";
import { video, VideoProviderError } from "@/lib/video";

/**
 * Receives MediaConvert job state changes forwarded by an EventBridge API
 * destination. Authentication is the provider's job (shared-secret header,
 * constant-time compare); this route only translates a verified event into
 * MediaAsset / Lecture updates.
 *
 * Local-dev has no public HTTPS origin, so the same events are also parked on
 * SQS and drained from studio refresh / curriculum listing. Keep this route
 * for when a public origin exists.
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

  const courseIds = await applyMediaConvertJobEvent(event);
  for (const courseId of courseIds) {
    revalidatePath(`/studio/courses/${courseId}/curriculum`);
  }

  return Response.json({ ok: true });
}
