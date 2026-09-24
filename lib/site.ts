/**
 * The storefront: who is selling, what it is called, how it describes itself,
 * and where it lives.
 *
 * Today there is one academy (single tenant). Nothing user-facing may spell the
 * academy's name, pitch, origin or certificate prefix as a literal — it reads
 * `getSite()` instead. That is the seam for multi-tenancy: when a second academy
 * arrives, `getSite()` resolves the tenant (by request host, most likely) and
 * returns its own SiteConfig, and pages, emails, the certificate PDF and serials
 * follow without edits. Data scoping (an organization id on courses, users,
 * coupons, orders) is the other half and is described in
 * docs/superpowers/specs/2026-09-25-ui-ux-overhaul-design.md §16.
 */
export type SiteConfig = {
  /** Brand as written everywhere: header, footer, emails, certificates. */
  name: string;
  /** For very tight spaces only. */
  shortName: string;
  /** Default document title after the brand, like other course marketplaces. */
  title: string;
  /** Meta description for the home page and link previews. */
  description: string;
  /** Home page headline and the sentence under it. */
  headline: string;
  lede: string;
  /** Absolute origin with no trailing slash; used in emails, receipts and share links. */
  url: string;
  /** BCP 47 locale for dates and numbers. */
  locale: string;
  /** Currency bKash settles in; the storefront's home currency. */
  currency: string;
  /** Prefix on certificate serials, e.g. GM360-1A2B-… */
  certificatePrefix: string;
};

// Same source of truth as Better Auth's base URL: the app's own origin.
function origin(): string {
  const raw = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

const GLOBALMENTOR360: Omit<SiteConfig, "url"> = {
  name: "GlobalMentor360",
  shortName: "GM360",
  title: "Online Courses with Certificates",
  description:
    "Learn programming, data, business and career skills online. Study at your own pace, earn a certificate when you finish, and pay in taka with bKash.",
  headline: "Build job-ready skills with online courses",
  lede: "Practical courses in programming, data, business and careers. Learn at your own pace, earn a certificate when you finish, and pay in taka with bKash.",
  locale: "en-BD",
  currency: "BDT",
  certificatePrefix: "GM360",
};

/** The storefront for the current request. One academy for now; see the note above. */
export function getSite(): SiteConfig {
  return { ...GLOBALMENTOR360, url: origin() };
}

/** Absolute URL on the storefront's origin, for emails and anything shared outside the app. */
export function siteUrl(path: string): string {
  return `${getSite().url}${path.startsWith("/") ? path : `/${path}`}`;
}
