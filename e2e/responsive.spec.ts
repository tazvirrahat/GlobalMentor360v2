import { expect, test, type Page } from "@playwright/test";
import { SEED, VIEWPORTS, signIn } from "./helpers";

/**
 * Viewport smoke: key shells must not overflow horizontally, and the sticky
 * header must not cover the page heading. Run against `npm run dev`.
 */

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
    };
  });
  expect(
    metrics.scrollWidth,
    `horizontal overflow: scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth}`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function assertHeaderDoesNotCoverHeading(page: Page) {
  const header = page.locator("header").first();
  const heading = page.locator("h1").first();
  if ((await header.count()) === 0 || (await heading.count()) === 0) return;
  if (!(await heading.isVisible())) return;

  const headerBox = await header.boundingBox();
  const headingBox = await heading.boundingBox();
  if (!headerBox || !headingBox) return;

  expect(
    headingBox.y,
    "sticky header is covering the page heading",
  ).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 2);
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 20_000 });
  await assertNoHorizontalOverflow(page);
  await assertHeaderDoesNotCoverHeading(page);
}

test.describe("responsive layout shells", () => {
  test.describe.configure({ timeout: 180_000 });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} public, learner, studio, admin`, async ({ page, context }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await visit(page, "/");
      await visit(page, "/courses");
      await visit(page, "/courses/typescript-foundations");
      await visit(page, "/sign-in");

      await signIn(page, SEED.learner, "/dashboard");
      await visit(page, "/dashboard");
      await visit(page, "/cart");
      await visit(page, "/courses/sql-for-analysts/checkout");
      await visit(page, "/account");
      await visit(page, "/notifications");
      await page.goto("/learn/typescript-foundations");
      await page.waitForURL(/\/learn\/typescript-foundations\/[^/]+/, { timeout: 30_000 });
      await page.getByRole("heading").first().waitFor({ state: "visible", timeout: 15_000 });
      await assertNoHorizontalOverflow(page);
      await assertHeaderDoesNotCoverHeading(page);

      await context.clearCookies();
      await signIn(page, SEED.instructor, "/studio");
      await visit(page, "/studio");
      await visit(page, "/studio/coupons");

      await context.clearCookies();
      await signIn(page, SEED.admin, "/admin");
      await visit(page, "/admin/payments");
      await visit(page, "/admin/users");
      await visit(page, "/admin/refunds");
    });
  }

  test("mobile header tap targets are usable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await signIn(page, SEED.learner, "/dashboard");

    const header = page.locator("header").first();
    const controls = header.locator("a, button");
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const control = controls.nth(i);
      if (!(await control.isVisible())) continue;
      const box = await control.boundingBox();
      if (!box) continue;
      expect(
        box.height,
        await control.getAttribute("aria-label") ?? (await control.textContent()) ?? "",
      ).toBeGreaterThanOrEqual(32);
      expect(box.width).toBeGreaterThanOrEqual(32);
    }
  });
});
