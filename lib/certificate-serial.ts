/**
 * Turn whatever someone typed or pasted into a certificate serial, or null.
 *
 * Serials look like PREFIX-XXXX-XXXX-XXXX-XXXX (16 hex characters; the prefix
 * comes from the site config). People copy them from a PDF, a LinkedIn post or
 * a link, so case, spaces, a missing prefix and the whole URL are all accepted.
 */
export function normalizeSerial(raw: string, prefix: string): string | null {
  let text = raw.trim();
  if (!text) return null;

  // A pasted link: take the segment after /certificates/.
  const fromUrl = text.match(/\/certificates\/([^/?#\s]+)/i);
  if (fromUrl) text = decodeURIComponent(fromUrl[1]!);

  const compact = text.toUpperCase().replace(/[\s-]+/g, "");
  const upperPrefix = prefix.toUpperCase();
  const hex = compact.startsWith(upperPrefix) ? compact.slice(upperPrefix.length) : compact;

  if (!/^[0-9A-F]{16}$/.test(hex)) return null;
  return `${upperPrefix}-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}
