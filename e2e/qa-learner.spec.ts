import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { expectHonestBkashMerchantCopy, SEED, signIn } from "./helpers";

/**
 * Exploratory learner/customer QA against a running app + seed.
 * Does not submit bKash (admin queue), does not start Stripe Checkout,
 * and does not trigger MediaConvert / paid AWS.
 */

// playwright.config.ts points DATABASE_URL at the _test database before specs load.
const LOCAL_DATABASE_URL = process.env.DATABASE_URL!;

const SQL_BDT_MINOR = 399_000;
const SAVE10_DISCOUNT_MINOR = Math.floor((SQL_BDT_MINOR * 10) / 100);
const SAVE10_TOTAL_MINOR = SQL_BDT_MINOR - SAVE10_DISCOUNT_MINOR;

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amountMinor / 100);
}

function attachDiagnostics(page: Page) {
  const failures: string[] = [];

  page.on("pageerror", (error) => {
    failures.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Download the React DevTools/i.test(text)) return;
    if (/Fast Refresh/i.test(text)) return;
    if (/Failed to load resource: the server responded with a status of 404/i.test(text)) return;
    failures.push(`console.error: ${text}`);
  });

  page.on("response", (response) => {
    if (response.status() >= 500) {
      failures.push(`5xx ${response.status()} ${response.url()}`);
    }
  });

  return {
    assertClean: async () => {
      await page.waitForLoadState("networkidle").catch(() => undefined);
      expect(failures, failures.join("\n")).toEqual([]);
    },
  };
}

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    return { clientWidth: doc.clientWidth, scrollWidth: doc.scrollWidth };
  });
  expect(
    metrics.scrollWidth,
    `horizontal overflow: scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth}`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: LOCAL_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function curriculum(slug: string) {
  return withDb(async (client) => {
    const result = await client.query<{
      id: string;
      title: string;
      isPreview: boolean;
      type: string;
    }>(
      `SELECT ci.id, ci.title, ci."isPreview" AS "isPreview", ci.type
       FROM curriculum_items ci
       JOIN sections s ON s.id = ci."sectionId"
       JOIN courses c ON c.id = s."courseId"
       WHERE c.slug = $1
       ORDER BY s.position, ci.position`,
      [slug],
    );
    return result.rows;
  });
}

function parsePercent(text: string | null): number | null {
  const match = text?.match(/(\d+)\s*%/);
  return match ? Number(match[1]) : null;
}

test.describe("learner QA — public catalog", () => {
  test("landing, catalog search, filters, and course landings render", async ({ page }) => {
    const diag = attachDiagnostics(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /learn with structure/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /explore courses/i }).first()).toBeVisible();

    await page.goto("/courses");
    await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
    await expect(page.locator("a[href^='/courses/']").first()).toBeVisible();

    await page.getByLabel("Search courses").fill("typescript");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=typescript/i);
    await expect(page.getByRole("link", { name: /typescript foundations/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sql for analysts/i })).toHaveCount(0);

    await page.goto("/courses?price=free");
    await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
    await expect(page.getByRole("link", { name: /enrol for free/i })).toHaveCount(0);

    await page.goto("/courses?price=paid&level=BEGINNER");
    await expect(page.getByRole("link", { name: /typescript foundations/i })).toBeVisible();

    await page.goto("/courses/typescript-foundations");
    await expect(page.getByRole("heading", { name: "TypeScript Foundations" })).toBeVisible();
    await expect(page.getByRole("link", { name: /preview: why typescript/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in to add to cart/i })).toBeVisible();

    await page.goto("/courses/sql-for-analysts");
    await expect(page.getByRole("heading", { name: "SQL for Analysts" })).toBeVisible();
    await expect(page.getByRole("link", { name: /preview: why sql still matters/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /buy this course/i })).toBeVisible();

    await diag.assertClean();
  });

  test("anon can play a preview and cannot open a locked sequel", async ({ page }) => {
    const diag = attachDiagnostics(page);
    const sqlItems = await curriculum("sql-for-analysts");
    const preview = sqlItems.find((item) => item.isPreview);
    const locked = sqlItems.find((item) => !item.isPreview);
    expect(preview && locked).toBeTruthy();

    await page.goto("/courses/sql-for-analysts");
    await page.getByRole("link", { name: /preview: why sql still matters/i }).click();
    await expect(page).toHaveURL(new RegExp(`/learn/sql-for-analysts/${preview!.id}`));
    await expect(page.getByText(/^preview$/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: preview!.title })).toBeVisible();

    await page.goto(`/learn/sql-for-analysts/${locked!.id}`);
    await expect(page).toHaveURL(/\/(courses\/sql-for-analysts|sign-in)/);
    await expect(page.getByRole("heading", { name: locked!.title })).toHaveCount(0);

    await diag.assertClean();
  });
});

test.describe("learner QA — session and library", () => {
  test("sign-in reaches My Learning with the seeded enrollment", async ({ page }) => {
    const diag = attachDiagnostics(page);
    await signIn(page, SEED.learner, "/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    const typescriptOnDashboard = page.getByRole("link", { name: /typescript foundations/i });
    if ((await typescriptOnDashboard.count()) === 0) {
      await page.getByRole("tab", { name: /completed/i }).click();
    }
    await expect(typescriptOnDashboard.first()).toBeVisible();
    await expect(page.getByText(/sql for analysts/i)).toHaveCount(0);
    await page.getByRole("link", { name: /continue|review/i }).first().click();
    await page.waitForURL(/\/learn\/typescript-foundations\/[^/]+/);
    await expect(page.getByText(/your progress/i)).toBeVisible();
    await diag.assertClean();
  });

  test("dashboard percent matches completed sidebar items in the player", async ({ page }) => {
    const diag = attachDiagnostics(page);
    await signIn(page, SEED.learner, "/dashboard");

    const typescriptLink = page.getByRole("link", { name: /typescript foundations/i });
    if ((await typescriptLink.count()) === 0) {
      await page.getByRole("tab", { name: /completed/i }).click();
    }
    await expect(typescriptLink.first()).toBeVisible();

    const tsRow = page.locator("li").filter({
      has: page.getByRole("link", { name: /typescript foundations/i }),
    });
    const dashPercent = parsePercent((await tsRow.getByText(/\d+%/).textContent()) ?? "");
    expect(dashPercent, "dashboard percent not found").not.toBeNull();

    await page.goto("/learn/typescript-foundations");
    await page.waitForURL(/\/learn\/typescript-foundations\/[^/]+/);
    await expect(page.getByText(/your progress/i)).toBeVisible();

    const playerPercent = parsePercent(
      await page.getByLabel(/course progress/i).getAttribute("aria-label"),
    );
    expect(playerPercent).toBe(dashPercent);

    const items = await curriculum("typescript-foundations");
    const lockedCount = await page.locator("aside nav li span.cursor-not-allowed").count();
    const impliedCompleted = Math.round(((playerPercent ?? 0) / 100) * items.length);
    const expectedUnlocked = Math.min(
      items.length,
      impliedCompleted + (impliedCompleted === items.length ? 0 : 1),
    );
    const expectedLocked = items.length - expectedUnlocked;
    expect(
      lockedCount,
      `progress ${playerPercent}% implies ${impliedCompleted}/${items.length} complete and ${expectedLocked} locked, but ${lockedCount} items are locked`,
    ).toBe(expectedLocked);

    const firstLessonCompleted =
      (await page.locator("main").getByText("Completed", { exact: true }).count()) > 0;
    if (!firstLessonCompleted) {
      expect(
        playerPercent,
        "progress percent is non-zero while the opening lesson is still incomplete",
      ).toBe(0);
    }

    await diag.assertClean();
  });

  test("enrolled sequential unlock does not leak later TypeScript lessons", async ({ page }) => {
    const diag = attachDiagnostics(page);
    const items = await curriculum("typescript-foundations");
    await signIn(page, SEED.learner, `/learn/typescript-foundations/${items[0]!.id}`);
    await expect(page.getByRole("heading", { name: items[0]!.title })).toBeVisible();

    const later = items.slice(1);
    for (const item of later) {
      const link = page.locator(`aside a[href="/learn/typescript-foundations/${item.id}"]`);
      const locked = page.locator("aside nav li").filter({ hasText: item.title }).locator("span.cursor-not-allowed");
      const linkVisible = (await link.count()) > 0;
      if (linkVisible) continue;

      await expect(locked.first()).toBeVisible();
      await page.goto(`/learn/typescript-foundations/${item.id}`);
      await expect(page).not.toHaveURL(new RegExp(`/learn/typescript-foundations/${item.id}$`));
      await expect(page.getByRole("heading", { name: item.title })).toHaveCount(0);
    }

    await diag.assertClean();
  });

  test("signed-in learner can preview SQL without unlocking the paid sequel", async ({ page }) => {
    const diag = attachDiagnostics(page);
    const sqlItems = await curriculum("sql-for-analysts");
    await signIn(page, SEED.learner, "/courses/sql-for-analysts");
    await page.getByRole("link", { name: /preview: why sql still matters/i }).click();
    await expect(page).toHaveURL(new RegExp(`/learn/sql-for-analysts/${sqlItems[0]!.id}`));
    await expect(page.getByText(/^preview$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /bookmark/i })).toHaveCount(0);

    await page.goto(`/learn/sql-for-analysts/${sqlItems[1]!.id}`);
    await expect(page).toHaveURL(/\/courses\/sql-for-analysts/);

    await diag.assertClean();
  });
});

test.describe("learner QA — cart and checkout", () => {
  test("cart add/remove, SAVE10 quote, and checkout amount agree", async ({ page }) => {
    const diag = attachDiagnostics(page);
    const subtotal = formatMoney(SQL_BDT_MINOR, "BDT");
    const discounted = formatMoney(SAVE10_TOTAL_MINOR, "BDT");
    const discount = formatMoney(SAVE10_DISCOUNT_MINOR, "BDT");

    await signIn(page, SEED.learner, "/cart");
    if ((await page.getByRole("link", { name: /sql for analysts/i }).count()) === 0) {
      await page.goto("/courses/sql-for-analysts");
      await page.getByRole("button", { name: /add to cart/i }).click();
      await expect(page).toHaveURL(/\/cart/);
    }

    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
    await expect(page.getByRole("link", { name: /sql for analysts/i })).toBeVisible();
    await expect(page.getByText(`Subtotal: ${subtotal}`)).toBeVisible();

    await page.getByLabel(/coupon/i).fill("SAVE10");
    await page.getByRole("button", { name: /^apply$/i }).click();
    await expect(page).toHaveURL(/coupon=SAVE10/i);
    await expect(page.getByText(`Subtotal: ${subtotal}`)).toBeVisible();
    await expect(page.getByText(`Discount (SAVE10): −${discount}`)).toBeVisible();
    await expect(page.getByText("Amount to send:")).toBeVisible();
    await expect(page.getByText(discounted).first()).toBeVisible();
    await expect(page.getByText(/via bKash|to our bKash number/i)).toBeVisible();

    const body = await page.locator("main").innerText();
    expectHonestBkashMerchantCopy(body);

    await page.goto("/courses/sql-for-analysts/checkout?coupon=SAVE10");
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await expect(page.getByText(`Subtotal: ${subtotal}`)).toBeVisible();
    await expect(page.getByText(discounted).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /continue to stripe/i })).toHaveCount(0);
    await expect(page.getByText(/via bKash|to our bKash number/i)).toBeVisible();
    const checkoutBody = await page.locator("main").innerText();
    expectHonestBkashMerchantCopy(checkoutBody);

    await page.goto("/cart?coupon=SAVE10");
    await page.getByRole("button", { name: /remove/i }).click();
    await expect(page.getByText(/your cart is empty/i)).toBeVisible();

    await page.goto("/courses/sql-for-analysts");
    await page.getByRole("button", { name: /add to cart/i }).click();
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByRole("link", { name: /sql for analysts/i })).toBeVisible();

    await diag.assertClean();
  });

  test("USD-only published course cannot be paid with empty Stripe keys", async ({ page }) => {
    const diag = attachDiagnostics(page);
    await signIn(page, SEED.learner, "/courses/postgres-for-application-developers");
    if ((await page.getByRole("heading", { name: /postgres for application developers/i }).count()) === 0) {
      test.skip(true, "sibling studio course not present");
      return;
    }

    const buy = page.getByRole("link", { name: /buy this course/i });
    if ((await buy.count()) === 0) {
      test.skip(true, "postgres course is not offered for sale");
      return;
    }

    await buy.click();
    await expect(page).toHaveURL(/\/courses\/postgres-for-application-developers\/checkout/);
    await expect(page.getByRole("button", { name: /continue to stripe/i })).toHaveCount(0);
    await expect(
      page.getByText(/no payment methods available|no bKash \(BDT\) price|cannot be bought/i),
    ).toBeVisible();

    await diag.assertClean();
  });
});

test.describe("learner QA — player, account, social", () => {
  test("notes, bookmark, Q&A, and article continue work on the first lecture", async ({ page }) => {
    const diag = attachDiagnostics(page);
    const items = await curriculum("typescript-foundations");
    await signIn(page, SEED.learner, `/learn/typescript-foundations/${items[0]!.id}`);

    await expect(page.getByRole("heading", { name: items[0]!.title })).toBeVisible();
    await expect(page.getByText(/your progress/i)).toBeVisible();
    await expect(page.locator("video")).toHaveCount(0);

    const note = `Learner QA note ${Date.now()}`;
    await page.getByPlaceholder(/capture something from this lecture/i).fill(note);
    await page.getByRole("button", { name: /save note/i }).click();
    await expect(page.getByText(note)).toBeVisible();

    const bookmark = page.getByRole("button", { name: /bookmark/i });
    await bookmark.click();
    await expect(page.getByRole("button", { name: /bookmarked/i })).toBeVisible();

    const questionTitle = `Why does sequential unlock exist ${Date.now()}?`;
    await page.getByLabel(/^title$/i).fill(questionTitle);
    await page.getByLabel(/^details$/i).fill("Checking that a learner can post a lecture question from the player.");
    await page.getByRole("button", { name: /post question/i }).click();
    await expect(page.getByRole("heading", { name: questionTitle })).toBeVisible();

    const continueBtn = page.getByRole("button", { name: /mark complete and continue/i });
    if ((await continueBtn.count()) > 0) {
      await continueBtn.click();
      await page.waitForURL(new RegExp(`/learn/typescript-foundations/${items[1]!.id}`));
      await expect(page.getByRole("heading", { name: items[1]!.title })).toBeVisible();
    }

    await diag.assertClean();
  });

  test("remaining TypeScript path: quiz gate, certificate, and PDF", async ({ page }) => {
    const diag = attachDiagnostics(page);
    const items = await curriculum("typescript-foundations");
    await signIn(page, SEED.learner, `/learn/typescript-foundations/${items[1]!.id}`);

    for (const item of items) {
      if (item.type === "QUIZ") continue;
      await page.goto(`/learn/typescript-foundations/${item.id}`);
      const mark = page.getByRole("button", { name: /mark complete/i });
      if ((await mark.count()) > 0) {
        await mark.click();
        await page.waitForLoadState("networkidle");
      }
    }

    const quiz = items.find((item) => item.type === "QUIZ")!;
    await page.goto(`/learn/typescript-foundations/${quiz.id}`);
    await expect(page.getByRole("heading", { name: quiz.title })).toBeVisible();
    await page.getByRole("radio", { name: /structural/i }).check();
    await page.getByRole("radio", { name: /^true$/i }).check();
    await page.getByRole("button", { name: /submit answers/i }).click();
    await expect(page.getByText(/passed/i)).toBeVisible({ timeout: 15_000 });

    await page.goto("/dashboard");
    await page.getByRole("tab", { name: /completed/i }).click();
    await expect(page.getByText(/typescript foundations/i)).toBeVisible();
    const certLink = page.getByRole("link", { name: /view certificate/i });
    await expect(certLink).toBeVisible();
    await certLink.click();
    await expect(page).toHaveURL(/\/certificates\//);
    await expect(page.getByRole("heading", { name: /typescript foundations/i })).toBeVisible();
    await expect(page.getByText(/this certifies that/i)).toBeVisible();
    await expect(page.getByText(/learner/i).first()).toBeVisible();

    const pdfHref = await page.getByRole("link", { name: /download pdf/i }).getAttribute("href");
    expect(pdfHref).toMatch(/\/certificates\/.+\/pdf$/);
    const pdf = await page.request.get(pdfHref!);
    expect(pdf.status(), "certificate PDF must not 5xx").toBe(200);
    expect(pdf.headers()["content-type"]).toMatch(/pdf/);

    await diag.assertClean();
  });

  test("account settings render; wrong password is refused without locking the seed", async ({
    page,
  }) => {
    const diag = attachDiagnostics(page);
    await signIn(page, SEED.learner, "/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page.getByText(/learner@example.com/i).first()).toBeVisible();
    await expect(page.getByText(/this device/i)).toBeVisible();

    await page.getByLabel("Current password").fill("definitely-not-the-seed");
    await page.getByLabel("New password", { exact: true }).fill("another-dev-password-999");
    await page.getByLabel("Confirm new password").fill("another-dev-password-999");
    await page.getByRole("button", { name: /update password/i }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("status")).not.toHaveText(/updated|saved|changed/i);

    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();

    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: /purchases/i })).toBeVisible();

    await page.context().clearCookies();
    await signIn(page, SEED.learner, "/dashboard");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();

    await diag.assertClean();
  });

  test("enrolled learner can post a review on TypeScript Foundations", async ({ page }) => {
    const diag = attachDiagnostics(page);
    await signIn(page, SEED.learner, "/courses/typescript-foundations");
    await expect(page.getByRole("heading", { name: /learner reviews/i })).toBeVisible();
    await page.getByRole("radio", { name: /5 stars/i }).check();
    const body = `Solid foundations walkthrough ${Date.now()}`;
    await page.getByLabel(/your review/i).fill(body);
    await page.getByRole("button", { name: /post review|update review/i }).click();
    await expect(page.getByText(/thanks — your review is live|saved/i)).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: body })).toBeVisible();
    await diag.assertClean();
  });
});

test.describe("learner QA — responsive smoke", () => {
  for (const width of [375, 1280] as const) {
    test(`${width}px home, catalog, dashboard, cart, checkout, player`, async ({ page }) => {
      const diag = attachDiagnostics(page);
      await page.setViewportSize({ width, height: width === 375 ? 667 : 720 });

      for (const path of ["/", "/courses", "/courses/sql-for-analysts", "/sign-in"]) {
        await page.goto(path);
        await page.locator("h1").first().waitFor({ state: "visible" });
        await assertNoHorizontalOverflow(page);
      }

      await signIn(page, SEED.learner, "/dashboard");
      await assertNoHorizontalOverflow(page);
      await page.goto("/cart");
      await page.locator("h1").first().waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(page);
      await page.goto("/courses/sql-for-analysts/checkout");
      await page.locator("h1").first().waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(page);
      await page.goto("/learn/typescript-foundations");
      await page.waitForURL(/\/learn\/typescript-foundations\/[^/]+/);
      await assertNoHorizontalOverflow(page);

      await diag.assertClean();
    });
  }
});
