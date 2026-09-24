import { expect, test } from "@playwright/test";

/**
 * Critical path: a learner can browse, sign in, open a course, and reach the
 * player for an enrolled item. Payment rails are not exercised here — card
 * needs live Stripe credentials, and bKash needs an admin click.
 */
test.describe("learner critical path", () => {
  test("home, catalog, and course landing render", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /learn with structure/i })).toBeVisible();

    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();

    const firstCourse = page.locator("a[href^='/courses/']").filter({ hasText: /.+/ }).first();
    await expect(firstCourse).toBeVisible();
    await firstCourse.click();
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("catalog search finds a published course", async ({ page }) => {
    await page.goto("/courses?q=typescript");
    await expect(page.getByRole("link", { name: /typescript foundations/i })).toBeVisible();
  });

  test("sign-in reaches the dashboard", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("learner@example.com");
    await page.getByLabel("Password").fill("dev-password-12345");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("enrolled learner can open the player", async ({ page }) => {
    await page.goto("/sign-in?next=/learn/typescript-foundations");
    await page.getByLabel("Email").fill("learner@example.com");
    await page.getByLabel("Password").fill("dev-password-12345");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Index redirects into /learn/[slug]/[itemId] — wait for that, not the index.
    await page.waitForURL(/\/learn\/typescript-foundations\/[^/]+/, { timeout: 30_000 });
    await expect(page.getByText(/your progress/i)).toBeVisible({ timeout: 15_000 });
  });

  test("preview lecture is playable from the landing page while signed out", async ({ page }) => {
    await page.goto("/courses/sql-for-analysts");
    await page.getByRole("link", { name: /preview: why sql still matters/i }).click();
    await expect(page).toHaveURL(/\/learn\/sql-for-analysts\//);
    await expect(page.getByText(/preview/i)).toBeVisible();
  });

  test("learner can add a course to the cart and open account settings", async ({ page }) => {
    await page.goto("/sign-in?next=/courses/sql-for-analysts");
    await page.getByLabel("Email").fill("learner@example.com");
    await page.getByLabel("Password").fill("dev-password-12345");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/courses\/sql-for-analysts/);

    await page.getByRole("button", { name: /add to cart/i }).click();
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
    await expect(page.getByRole("link", { name: /sql for analysts/i })).toBeVisible();

    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page.getByLabel("Current password")).toBeVisible();

    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  });
});

test.describe("staff surfaces", () => {
  test("instructor can open studio coupons", async ({ page }) => {
    await page.goto("/sign-in?next=/studio/coupons");
    await page.getByLabel("Email").fill("instructor@example.com");
    await page.getByLabel("Password").fill("dev-password-12345");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/studio\/coupons/);
    await expect(page.getByRole("heading", { name: "Coupons" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Studio" })).toBeVisible();
  });

  test("admin can open refunds and is not 404 at /admin", async ({ page }) => {
    await page.goto("/sign-in?next=/admin");
    await page.getByLabel("Email").fill("admin@example.com");
    await page.getByLabel("Password").fill("dev-password-12345");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin\/payments/);
    await page.goto("/admin/refunds");
    await expect(page.getByRole("heading", { name: "Refunds" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /no paid orders/i }).or(
        page.getByRole("button", { name: /refund and revoke access/i }).first(),
      ),
    ).toBeVisible();
  });
});
