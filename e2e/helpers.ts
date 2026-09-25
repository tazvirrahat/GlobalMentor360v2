import { expect, type Locator, type Page } from "@playwright/test";

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
  await page.getByLabel("Password", { exact: true }).fill(account.password);
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

/** Admin / studio lists are 20 per page; seed + vol- fixtures span several pages. */
export async function findOnPagedList(page: Page, target: Locator, maxPages = 20): Promise<boolean> {
  const origin = new URL(page.url());
  for (let i = 1; i <= maxPages; i += 1) {
    if (i > 1) {
      origin.searchParams.set("page", String(i));
      await page.goto(`${origin.pathname}?${origin.searchParams.toString()}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      await page.locator("h1").first().waitFor({ state: "visible", timeout: 20_000 });
    }
    if (await target.first().isVisible()) return true;
    const next = page.getByRole("navigation", { name: "Pages" }).first().getByRole("link", {
      name: "Next",
    });
    if ((await next.count()) === 0) break;
  }
  return target.first().isVisible();
}

export async function paginateUntilVisible(page: Page, target: Locator, maxPages = 20) {
  await findOnPagedList(page, target, maxPages);
  await expect(target.first()).toBeVisible();
}

export async function adminSearch(page: Page, query: string) {
  const search = page.getByRole("search");
  await search.getByRole("searchbox").fill(query);
  await search.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/[?&]q=/, { timeout: 20_000 });
}

/** Prior e2e runs may have left the seed learner with INSTRUCTOR. */
export async function ensureSeedLearnerIsNotInstructor(page: Page) {
  await signIn(page, SEED.admin, "/admin/users");
  await adminSearch(page, SEED.learner.email);
  const row = page.getByRole("row").filter({ has: page.getByText(SEED.learner.email, { exact: true }) });
  await expect(row).toBeVisible();
  const remove = row.getByRole("button", { name: /remove instructor/i });
  if (await remove.isVisible()) {
    await remove.click();
    await expect(row.getByRole("button", { name: /make instructor/i })).toBeVisible();
  }
}
