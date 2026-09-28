/**
 * The product palette.
 * app/globals.css is the runtime source; this module exists so the contrast of
 * every pairing the UI uses is proven by a test, and so globals.css cannot drift.
 */
export const PALETTE = {
  paper: "#fcfcfd",
  surface: "#ffffff",
  ink: "#1d2242",
  graphite: "#5e6376",
  rule: "#e3e5ec",
  control: "#8a8fa3",
  wash: "#f3f4f7",
  mark: "#f6e35a",
  verified: "#0b5d46",
  seal: "#d2303f",
  caution: "#8a5a00",
  cautionWash: "#fbf1d6",
} as const satisfies Record<string, `#${string}`>;

export type TokenName = keyof typeof PALETTE;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

type Side = TokenName | "white";

/** Every foreground/background pairing the UI uses, with the WCAG minimum it must meet. */
export const REQUIRED_PAIRS: { fg: Side; bg: Side; min: number; use: string }[] = [
  { fg: "ink", bg: "paper", min: 4.5, use: "body text" },
  { fg: "graphite", bg: "paper", min: 4.5, use: "secondary text" },
  { fg: "graphite", bg: "surface", min: 4.5, use: "secondary text on panels" },
  { fg: "graphite", bg: "wash", min: 4.5, use: "inactive tab, table header" },
  { fg: "white", bg: "ink", min: 4.5, use: "primary button" },
  { fg: "white", bg: "verified", min: 4.5, use: "paid/verified badge" },
  { fg: "verified", bg: "surface", min: 4.5, use: "verified text" },
  { fg: "white", bg: "seal", min: 4.5, use: "destructive button" },
  { fg: "seal", bg: "surface", min: 4.5, use: "error text" },
  { fg: "caution", bg: "cautionWash", min: 4.5, use: "pending notice" },
  { fg: "ink", bg: "mark", min: 4.5, use: "current lesson highlight" },
  { fg: "control", bg: "surface", min: 3, use: "input borders (1.4.11)" },
  { fg: "ink", bg: "surface", min: 3, use: "focus outline (1.4.11)" },
];
