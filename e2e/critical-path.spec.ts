import { expect, test } from "@playwright/test";

/**
 * Critical path: a learner can browse, sign in, open a course, and reach the
 * player for an enrolled item. Payment rails are not exercised here — card
 * needs live Stripe credentials, and bKash needs an admin click.
 */
test.describe("learner critical path", () => {
  test("home, catalog, and course landing render", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /learn real skills/i })).toBeVisible();

    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();

    const firstCourse = page.locator("a[href^='/courses/']").filter({ hasText: /.+/ }).first();
    await expect(firstCourse).toBeVisible();
    await firstCourse.click();
    await expect(page.getByRole("heading").first()).toBeVisible();
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
});
