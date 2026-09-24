/**
 * Compact device/browser labels from a stored User-Agent string.
 * Display-only — does not persist new fields.
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent?.trim()) return "Unknown device";
  const ua = userAgent;

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua) || /CriOS\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua) || /FxiOS\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;

  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows NT/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return "Unknown device";
}
