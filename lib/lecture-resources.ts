/**
 * Lecture resources: a link (externalUrl set, no stored file) or a file stored
 * under resources/<lectureId>/… in the app bucket. Pure helpers only; the
 * database and S3 work lives in the studio actions, lib/storage and the
 * download route.
 */

export const RESOURCE_MAX_BYTES = 100 * 1024 * 1024;
export const RESOURCE_TITLE_MAX = 120;
export const RESOURCES_PER_LECTURE = 20;

export function parseResourceLink(
  title: string,
  url: string,
): { ok: true; value: { title: string; url: string } } | { ok: false; message: string } {
  const name = title.trim();
  const raw = url.trim();
  if (!name) return { ok: false, message: "Give the link a name learners will recognise." };
  if (name.length > RESOURCE_TITLE_MAX) return { ok: false, message: `Keep the name to ${RESOURCE_TITLE_MAX} characters.` };
  if (!raw) return { ok: false, message: "Enter the web address." };
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, message: "Enter a web address, like docs.example.com/guide." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, message: "Use a web address that starts with https://." };
  }
  return { ok: true, value: { title: name, url: parsed.toString() } };
}

/** The name a file is saved under: path parts and control characters removed, length capped. */
export function safeDownloadName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 150);
  return cleaned || "download";
}

/** Where a lecture's file lives in the bucket. The id keeps two uploads of "notes.pdf" apart. */
export function resourceStorageKey(lectureId: string, fileId: string, filename: string): string {
  const name = safeDownloadName(filename)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
  return `resources/${lectureId}/${fileId}/${name || "file"}`;
}

/** True when a key belongs to this lecture's folder (so a client cannot finish someone else's upload). */
export function isKeyForLecture(key: string, lectureId: string): boolean {
  return key.startsWith(`resources/${lectureId}/`) && !key.includes("..");
}

/** "2.4 MB", "830 KB", "12 bytes". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}
