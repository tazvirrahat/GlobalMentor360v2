"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  canAccessItemMedia,
  getContinueTargetItemId,
  markLectureComplete,
  submitQuizAttempt,
  updateWatchPosition,
  type QuizSubmission,
} from "@/lib/progress";
import { getCurrentUser } from "@/lib/session";
import { video } from "@/lib/video";

export type CompleteLectureState = { status: "idle" } | { status: "error"; message: string };

export async function completeLectureAction(
  _prev: CompleteLectureState,
  formData: FormData,
): Promise<CompleteLectureState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Sign in first." };

  const itemId = String(formData.get("itemId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const result = await markLectureComplete(user.id, itemId);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath(`/learn/${slug}`);
  revalidatePath("/dashboard");

  // Continue target is derived after the write, not from the form. A hidden
  // nextItemId can be swapped for a later preview that was already unlocked.
  const nextId = await getContinueTargetItemId(user.id, slug, itemId);
  if (nextId) {
    redirect(`/learn/${slug}/${nextId}` as Route);
  }
  redirect(`/learn/${slug}` as Route);
}

/**
 * The player reports where the playhead is, never how much has been watched —
 * watch credit is metered server-side in updateWatchPosition so that seeking to
 * the end of a video cannot complete it.
 */
export async function reportWatchProgress(input: {
  itemId: string;
  slug: string;
  positionSeconds: number;
}) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, message: "Sign in first." };

  const result = await updateWatchPosition(user.id, input.itemId, input.positionSeconds);
  if (result.ok && result.completed) {
    revalidatePath(`/learn/${input.slug}`);
    revalidatePath("/dashboard");
  }
  return result;
}

export async function getSignedPlayback(itemId: string) {
  const user = await getCurrentUser();
  if (!(await canAccessItemMedia(user?.id ?? null, itemId))) {
    return { ok: false as const, message: "You don't have access to this lecture." };
  }

  const lecture = await db.lecture.findFirst({
    where: { curriculumItemId: itemId },
    select: {
      asset: {
        select: {
          id: true,
          providerAssetId: true,
          status: true,
          captions: { select: { id: true, language: true }, orderBy: { language: "asc" } },
        },
      },
    },
  });

  if (!lecture?.asset || lecture.asset.status !== "READY" || !lecture.asset.providerAssetId) {
    return { ok: false as const, message: "Video is still processing." };
  }

  try {
    const playback = video.signPlaybackUrl(lecture.asset.providerAssetId);
    return {
      ok: true as const,
      hlsUrl: playback.hlsUrl,
      expiresAt: playback.expiresAt.toISOString(),
      captions: lecture.asset.captions.map((caption) => ({
        id: caption.id,
        language: caption.language,
        src: `/api/captions/${caption.id}`,
      })),
    };
  } catch (error) {
    // A VideoProviderError names the env vars an operator needs to set. That is
    // useful in the server log and nowhere near a learner's screen.
    console.error("Playback signing failed for item %s:", itemId, error);
    return {
      ok: false as const,
      message: "Video is unavailable right now. Please try again shortly.",
    };
  }
}

const quizSchema = z.object({
  assessmentId: z.string().min(1),
  slug: z.string().min(1),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedOptionIds: z.array(z.string()),
    }),
  ),
});

export async function submitQuizAction(input: {
  assessmentId: string;
  slug: string;
  answers: QuizSubmission[];
}) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, message: "Sign in first." };

  const parsed = quizSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Invalid submission." };

  const result = await submitQuizAttempt(
    user.id,
    parsed.data.assessmentId,
    parsed.data.answers,
  );

  if (result.ok) {
    revalidatePath(`/learn/${parsed.data.slug}`);
    revalidatePath("/dashboard");
  }

  return result;
}
