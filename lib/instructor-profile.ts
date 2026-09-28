/**
 * The studio profile form, checked the same way on every path. Headline is the
 * one line under a name ("Senior data analyst"), bio the About text, website an
 * http(s) link shown on the public page.
 */

export const HEADLINE_MAX = 60;
export const BIO_MAX = 2000;

export type ProfileInput = {
  headline: string | null;
  bio: string | null;
  websiteUrl: string | null;
  profilePublic: boolean;
};

export function parseProfileInput(fields: {
  headline: string;
  bio: string;
  websiteUrl: string;
  profilePublic: boolean;
}): { ok: true; value: ProfileInput } | { ok: false; field: "headline" | "bio" | "websiteUrl"; message: string } {
  const headline = fields.headline.trim();
  const bio = fields.bio.trim();
  const website = fields.websiteUrl.trim();

  if (headline.length > HEADLINE_MAX) {
    return { ok: false, field: "headline", message: `Keep the headline to ${HEADLINE_MAX} characters.` };
  }
  if (bio.length > BIO_MAX) {
    return { ok: false, field: "bio", message: `Keep the bio to ${BIO_MAX} characters.` };
  }

  let websiteUrl: string | null = null;
  if (website) {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(website) ? website : `https://${website}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      return { ok: false, field: "websiteUrl", message: "Enter a web address, like example.com." };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, field: "websiteUrl", message: "Use a web address that starts with https://." };
    }
    websiteUrl = url.toString();
  }

  return {
    ok: true,
    value: { headline: headline || null, bio: bio || null, websiteUrl, profilePublic: fields.profilePublic },
  };
}
