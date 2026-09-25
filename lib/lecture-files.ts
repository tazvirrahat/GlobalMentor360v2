import { safeDownloadName } from "@/lib/lecture-resources";

/**
 * Audio and PDF lectures: the lesson itself is a file in the app bucket under
 * lecture-files/<lectureId>/<fileId>/<name>, held by a MediaAsset with
 * provider "file". Pure helpers only.
 */

export type LectureFileKind = "AUDIO" | "FILE";

export const LECTURE_FILE_PROVIDER = "file";

const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm"]);
const PDF_TYPE = "application/pdf";

export const LECTURE_FILE_ACCEPT = [...AUDIO_TYPES, PDF_TYPE].join(",");

export const LECTURE_FILE_MAX_BYTES: Record<LectureFileKind, number> = {
  AUDIO: 200 * 1024 * 1024,
  FILE: 50 * 1024 * 1024,
};

export function lectureFileKind(contentType: string): LectureFileKind | null {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  if (type === PDF_TYPE) return "FILE";
  return AUDIO_TYPES.has(type) ? "AUDIO" : null;
}

export function lectureFileLimitText(kind: LectureFileKind): string {
  return kind === "AUDIO" ? "Audio files can be up to 200 MB." : "PDFs can be up to 50 MB.";
}

export function lectureFileKey(lectureId: string, fileId: string, filename: string): string {
  const name = safeDownloadName(filename)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
  return `lecture-files/${lectureId}/${fileId}/${name || "file"}`;
}

/** True when a key sits in this lecture's folder (so a client cannot point it at another lecture's file). */
export function isLectureFileKey(key: string, lectureId: string): boolean {
  const parts = key.split("/");
  return parts.length === 4 && parts[0] === "lecture-files" && parts[1] === lectureId && !parts.includes("..") && parts.every(Boolean);
}

/** The name a download is saved under: the key's last part. */
export function lectureFileName(key: string): string {
  return key.split("/").pop() || "lesson";
}

/** A browser-reported audio length, as whole seconds within a day; 0 when unknown. */
export function audioSeconds(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 24 * 60 * 60) : 0;
}
