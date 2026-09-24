/** The player's tabs, in order. `?tab=` holds one of these. */
export const PLAYER_TABS = ["overview", "qa", "notes", "announcements"] as const;
export type PlayerTab = (typeof PLAYER_TABS)[number];

/** The tab to open: the one in the URL when this learner has it, else the first. */
export function pickTab(raw: string | undefined, available: readonly PlayerTab[]): PlayerTab {
  return available.find((tab) => tab === raw) ?? available[0] ?? "overview";
}

const two = (n: number) => String(n).padStart(2, "0");

/** A video time as people write it: 1:15, or 1:02:05 past an hour. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/**
 * Reads "1:15", "1:02:05" or plain seconds ("75"). Empty means the start (0).
 * Null when it is not a time, so the form can say so instead of guessing.
 */
export function parseClock(text: string): number | null {
  const value = text.trim();
  if (value === "") return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, h, m, s] = match;
  const minutes = Number(m);
  const secs = Number(s);
  if (secs > 59 || (h !== undefined && minutes > 59)) return null;
  return Number(h ?? 0) * 3600 + minutes * 60 + secs;
}
