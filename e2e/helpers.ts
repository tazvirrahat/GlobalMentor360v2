import { expect, type Page } from "@playwright/test";

export const SEED_PASSWORD = "dev-password-12345";

export const SEED = {
  learner: { email: "learner@example.com", password: SEED_PASSWORD },
  instructor: { email: "instructor@example.com", password: SEED_PASSWORD },
  admin: { email: "admin@example.com", password: SEED_PASSWORD },
} as const;

/**
 * Transfer instructions may name the academy number only when
 * BKASH_MERCHANT_NUMBER is set. Empty env must not say "our bKash number"
 * without digits, and must never invent an 01XXXXXXXXX merchant number.
 */
export function expectHonestBkashMerchantCopy(body: string) {
  const named = /to our bKash number/i.test(body);
  if (named) {
    expect(
      body,
      "copy that names 'our bKash number' must show the configured digits",
    ).toMatch(/to our bKash number[\s\S]{0,80}?01\d{9}/i);
  } else {
    expect(body).toMatch(/shared by the academy/i);
  }
}

export async function signIn(
  page: Page,
  account: { email: string; password: string },
  next?: string,
) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20_000 });
}

export const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 667 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 720 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;
