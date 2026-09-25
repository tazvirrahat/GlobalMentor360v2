"use server";

import { getCurrentUser } from "@/lib/session";
import { resolvePromoVideo } from "@/lib/promo";
import { video } from "@/lib/video";

/** A signed HLS URL for a course's promo, for the same player lectures use. */
export async function getPromoPlayback(courseId: string) {
  const user = await getCurrentUser();
  const promo = await resolvePromoVideo(user?.id ?? null, String(courseId ?? ""));
  if (!promo) return { ok: false as const, message: "This video isn't available." };
  try {
    const playback = video.signPlaybackUrl(promo.providerAssetId);
    return {
      ok: true as const,
      hlsUrl: playback.hlsUrl,
      expiresAt: playback.expiresAt.toISOString(),
      // Captions attach to lectures only for now (see plan 13); a promo plays without a track.
      captions: [] as { id: string; language: string; src: string }[],
    };
  } catch (error) {
    console.error("Promo playback signing failed for course %s:", courseId, error);
    return { ok: false as const, message: "Video is unavailable right now. Please try again shortly." };
  }
}
