import { db } from "@/lib/db";
import { canAccessItemMedia } from "@/lib/progress";
import { resolvePromoVideo } from "@/lib/promo";
import { video } from "@/lib/video";

/**
 * Signed HLS playback for the player: a lecture's video (the lecture media
 * rule, canAccessItemMedia) or a course's promo (lib/promo). Served by GET
 * routes under /api/playback, so it keeps working in the read-only "view as"
 * mode, where proxy.ts refuses every POST.
 */

export type Playback =
  | { ok: true; hlsUrl: string; expiresAt: string; captions: { id: string; language: string; src: string }[] }
  | { ok: false; message: string };

const UNAVAILABLE = "Video is unavailable right now. Please try again shortly.";

function sign(providerAssetId: string, captions: { id: string; language: string }[], label: string): Playback {
  try {
    const playback = video.signPlaybackUrl(providerAssetId);
    return {
      ok: true,
      hlsUrl: playback.hlsUrl,
      expiresAt: playback.expiresAt.toISOString(),
      captions: captions.map((caption) => ({ id: caption.id, language: caption.language, src: `/api/captions/${caption.id}` })),
    };
  } catch (error) {
    // A VideoProviderError names the env vars an operator needs to set. That is
    // useful in the server log and nowhere near a learner's screen.
    console.error("Playback signing failed for %s:", label, error);
    return { ok: false, message: UNAVAILABLE };
  }
}

export async function lecturePlayback(userId: string | null, itemId: string): Promise<Playback> {
  if (!(await canAccessItemMedia(userId, itemId))) return { ok: false, message: "You don't have access to this lecture." };
  const lecture = await db.lecture.findFirst({
    where: { curriculumItemId: itemId },
    select: {
      asset: {
        select: {
          providerAssetId: true,
          status: true,
          captions: { select: { id: true, language: true }, orderBy: { language: "asc" } },
        },
      },
    },
  });
  if (!lecture?.asset || lecture.asset.status !== "READY" || !lecture.asset.providerAssetId) {
    return { ok: false, message: "Video is still processing." };
  }
  return sign(lecture.asset.providerAssetId, lecture.asset.captions, `item ${itemId}`);
}

export async function promoPlayback(userId: string | null, courseId: string): Promise<Playback> {
  const promo = await resolvePromoVideo(userId, courseId);
  if (!promo) return { ok: false, message: "This video isn't available." };
  // Captions attach to lectures only for now; a promo plays without a track.
  return sign(promo.providerAssetId, [], `promo ${courseId}`);
}
