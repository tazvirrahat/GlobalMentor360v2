"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { canPlayItem } from "@/lib/entitlement";
import {
  markLectureComplete,
  submitQuizAttempt,
  updateWatchPosition,
  type QuizSubmission,
} from "@/lib/progress";
import { getCurrentUser } from "@/lib/session";
import { video } from "@/lib/video";

export async function completeLectureAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const itemId = String(formData.get("itemId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const result = await markLectureComplete(user.id, itemId);
  if (!result.ok) return;

  revalidatePath(`/learn/${slug}`);
  revalidatePath("/dashboard");

  // Land on the learn index so it picks the next unlocked item.
  redirect(`/learn/${slug}` as Route);
}

export async function reportWatchProgress(input: {
  itemId: string;
  slug: string;
  positionSeconds: number;
  watchedSeconds: number;
}) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, message: "Sign in first." };

  const result = await updateWatchPosition(
    user.id,
    input.itemId,
    input.positionSeconds,
    input.watchedSeconds,
  );
  if (result.ok && result.completed) {
    revalidatePath(`/learn/${input.slug}`);
    revalidatePath("/dashboard");
  }
  return result;
}

export async function getSignedPlayback(itemId: string) {
  const user = await getCurrentUser();
  const decision = await canPlayItem(user?.id ?? null, itemId);
  if (!decision.allowed) {
    return { ok: false as const, message: "You don't have access to this lecture." };
  }

  const lecture = await db.lecture.findFirst({
    where: { curriculumItemId: itemId },
    select: {
      asset: { select: { providerAssetId: true, status: true } },
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
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Could not sign playback URL.",
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
