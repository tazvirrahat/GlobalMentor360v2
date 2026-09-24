/**
 * The generated cover beside a course in lists: a light tint picked from the
 * course's slug, with the title's first letter in ink. (Keyed by course, not
 * category: hashing a handful of categories into six tints put most courses on
 * the same colour.) Six restrained
 * tints, none of them a colour that already means something (the highlighter,
 * pending sand, verified green, seal red).
 */
export const COVER_TINTS = [
  { name: "blue", bg: "#e6eaf6" },
  { name: "lilac", bg: "#eee8f4" },
  { name: "sky", bg: "#e3eff5" },
  { name: "clay", bg: "#f4e8e2" },
  { name: "olive", bg: "#ecefdf" },
  { name: "slate", bg: "#e9ebef" },
] as const satisfies readonly { name: string; bg: `#${string}` }[];

export type CoverTint = (typeof COVER_TINTS)[number];

/** FNV-1a: the same category always gets the same tint. */
export function coverTint(key: string): CoverTint {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return COVER_TINTS[(hash >>> 0) % COVER_TINTS.length]!;
}

export function coverInitial(title: string): string {
  const match = title.match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : "?";
}
