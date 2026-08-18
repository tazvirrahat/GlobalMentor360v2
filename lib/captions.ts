import { db } from "@/lib/db";
import { getOwnedLectureItem } from "@/lib/studio";
import { putCaptionObject, VideoProviderError } from "@/lib/video";

/**
 * Captions are uploaded VTT files attached to a MediaAsset. AWS does not
 * generate them for us (that would be a MediaConvert caption sidecar we do
 * not run), so studio authors attach a file per language.
 */

const LANGUAGE = /^[a-z]{2}(?:-[A-Z]{2})?$/;

export function isCaptionLanguage(value: string): boolean {
  return LANGUAGE.test(value);
}

export function looksLikeVtt(body: string): boolean {
  const trimmed = body.replace(/^\uFEFF/, "").trimStart();
  return trimmed.startsWith("WEBVTT");
}

export async function attachUploadedCaption(input: {
  instructorId: string;
  itemId: string;
  language: string;
  vtt: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const language = input.language.trim();
  if (!isCaptionLanguage(language)) {
    return { ok: false, message: "Use a language code like en or en-US." };
  }
  if (!looksLikeVtt(input.vtt)) {
    return { ok: false, message: "That file is not a WebVTT caption file." };
  }
  if (input.vtt.length > 1_000_000) {
    return { ok: false, message: "Caption files must be under 1 MB." };
  }

  const item = await getOwnedLectureItem(input.itemId, input.instructorId);
  const asset = item?.lecture?.asset;
  if (!item?.lecture || !asset?.providerAssetId) {
    return { ok: false, message: "Upload a video before attaching captions." };
  }

  let vttKey: string;
  try {
    vttKey = await putCaptionObject(asset.providerAssetId, language, input.vtt);
  } catch (error) {
    const message =
      error instanceof VideoProviderError
        ? error.message
        : "Could not store the caption file.";
    return { ok: false, message };
  }

  await db.caption.upsert({
    where: { assetId_language: { assetId: asset.id, language } },
    create: { assetId: asset.id, language, vttKey, source: "UPLOADED" },
    update: { vttKey, source: "UPLOADED" },
  });

  return { ok: true };
}

export async function listCaptionsForAsset(assetId: string) {
  return db.caption.findMany({
    where: { assetId },
    orderBy: { language: "asc" },
    select: { id: true, language: true, source: true },
  });
}

export async function getCaptionForPlayback(captionId: string) {
  return db.caption.findUnique({
    where: { id: captionId },
    select: {
      id: true,
      language: true,
      vttKey: true,
      asset: {
        select: {
          id: true,
          lectures: {
            select: { curriculumItemId: true },
            take: 1,
          },
        },
      },
    },
  });
}
