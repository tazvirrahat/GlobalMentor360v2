import { expect, test, type Page } from "@playwright/test";
import { SEED, adminSearch, findOnPagedList, paginateUntilVisible, signIn } from "./helpers";

/**
 * Exploratory QA for the ADMIN persona. Mutating tests restore seed where they
 * can (republish SQL, re-grant/remove instructor on the learner, hide then
 * restore a review). Payment tests use a unique trx ID; reject uses the seed
 * learner (no enrollment). Approve+refund uses the admin account as buyer so
 * the seed learner is not enrolled in SQL for Analysts.
 */

function uniqueTrx(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(
    0,
    24,
  );
}

async function cartBadgeCount(page: Page) {
  const cart = page.getByRole("banner").getByRole("link", { name: /cart/i });
  await expect(cart).toBeVisible();
  const badge = cart.locator("span").filter({ hasText: /^\d+\+?$/ });
  if ((await badge.count()) === 0) return 0;
  const text = (await badge.first().innerText()).replace("+", "");
  return Number.parseInt(text, 10);
}

async function adminCourseRow(page: Page, title: string) {
  return page.locator("li").filter({ hasText: title });
}

async function ensureCoursePublished(page: Page, title: string) {
  await page.goto("/admin/courses");
  await adminSearch(page, title);
  const row = await adminCourseRow(page, title);
  await expect(row).toBeVisible();
  const publish = row.getByRole("button", { name: "Publish", exact: true });
  if (await publish.isVisible()) {
    await publish.click();
  }
  await expect(row.getByRole("button", { name: "Unpublish", exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

async function submitBkashCheckout(page: Page, trx: string) {
  await page.getByLabel("bKash transaction ID").fill(trx);
  await page.getByLabel("Your bKash number").fill("01712345678");
  await page.getByLabel("Date of payment").fill("2026-08-01");
  await page.getByRole("button", { name: /submit payment for verification/i }).click();
  await expect(page.getByText(/payment submitted|awaiting verification/i)).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("admin exploratory QA", () => {
  test.describe.configure({ timeout: 90_000 });

  test("learner is redirected away from /admin", async ({ page }) => {
    await signIn(page, SEED.learner, "/admin");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });

  test("admin index redirects and nav reaches every staff page", async ({ page }) => {
    await signIn(page, SEED.admin, "/admin");
    await expect(page).toHaveURL(/\/admin\/payments/);
    await expect(page.getByRole("heading", { name: "Payment verification" })).toBeVisible();
    await expect(page.getByText(/\d+ awaiting/)).toBeVisible();

    const adminNav = page.getByRole("navigation", { name: "Admin" });
    await expect(adminNav.getByRole("link", { name: "Payments" })).toBeVisible();
    await expect(adminNav.getByRole("link", { name: "Refunds" })).toBeVisible();
    await expect(adminNav.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(adminNav.getByRole("link", { name: "Courses" })).toBeVisible();
    await expect(adminNav.getByRole("link", { name: "Reviews" })).toBeVisible();

    await adminNav.getByRole("link", { name: "Users", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();

    await adminNav.locator('a[href="/admin/courses"]').click();
    await expect(page).toHaveURL(/\/admin\/courses/);
    await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
    await adminSearch(page, "SQL for Analysts");
    await expect(page.getByText("SQL for Analysts")).toBeVisible();

    await adminNav.locator('a[href="/admin/reviews"]').click();
    await expect(page).toHaveURL(/\/admin\/reviews/);
    await expect(page.getByRole("heading", { level: 1, name: "Reviews" })).toBeVisible();

    await adminNav.locator('a[href="/admin/refunds"]').click();
    await expect(page).toHaveURL(/\/admin\/refunds/);
    await expect(page.getByRole("heading", { level: 1, name: "Refunds" })).toBeVisible();

    await adminNav.locator('a[href="/admin/payments"]').click();
    await expect(page).toHaveURL(/\/admin\/payments/);
    await expect(page.getByRole("heading", { name: "Payment verification" })).toBeVisible();
    await expect(page.getByText(/pick a student|enroll this user|grant access/i)).toHaveCount(0);
  });

  test("cannot remove own admin role; learner can be made instructor then reverted", async ({
    page,
  }) => {
    await signIn(page, SEED.admin, "/admin/users");
    await adminSearch(page, SEED.admin.email);

    const adminCard = page.locator("li").filter({ hasText: SEED.admin.email });
    await adminCard.getByRole("button", { name: /remove admin/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText(/cannot remove your own admin role/i)).toBeVisible();

    await page.goto("/admin/users");
    const search = page.getByPlaceholder("Search name or email");
    await search.fill(SEED.learner.email);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(SEED.learner.email)}`));

    const learnerCard = page.locator("li").filter({ hasText: `· ${SEED.learner.email}` });
    await expect(learnerCard).toBeVisible();
    const makeInstructor = learnerCard.getByRole("button", { name: /make instructor/i });
    const removeInstructor = learnerCard.getByRole("button", { name: /remove instructor/i });
    if (await removeInstructor.isVisible()) {
      await removeInstructor.click();
      await expect(makeInstructor).toBeVisible();
    }
    await makeInstructor.click();
    await expect(learnerCard.getByText("INSTRUCTOR", { exact: true })).toBeVisible();
    await learnerCard.getByRole("button", { name: /remove instructor/i }).click();
    await expect(makeInstructor).toBeVisible();
  });

  test("review error query is surfaced; hide/restore round-trips a live review", async ({
    page,
    context,
  }) => {
    await signIn(page, SEED.admin, "/admin/reviews?error=Could%20not%20find%20that%20review");
    await expect(page.getByRole("alert").filter({ hasText: "Could not update review" })).toBeVisible();
    await expect(page.getByText("Could not find that review")).toBeVisible();

    await context.clearCookies();
    await signIn(page, SEED.learner, "/courses/typescript-foundations");
    const reviewBox = page.getByRole("heading", { name: /write a review|edit your review/i });
    await expect(reviewBox).toBeVisible();
    await page.locator("label").filter({ hasText: /^5 stars$/ }).click();
    await page.getByLabel("Your review (optional)").fill("QA-ADMIN hide/restore probe.");
    await page.getByRole("button", { name: /post review|update review/i }).click();
    await expect(page.getByText(/thanks — your review is live|saved/i)).toBeVisible({
      timeout: 15_000,
    });

    await context.clearCookies();
    await signIn(page, SEED.admin, "/admin/reviews");
    const card = page.locator("li").filter({ hasText: "QA-ADMIN hide/restore probe." });
    await paginateUntilVisible(page, card);
    await card.getByRole("button", { name: "Hide" }).click();
    await paginateUntilVisible(page, card);
    await expect(card.getByText("HIDDEN")).toBeVisible();

    await page.goto("/courses/typescript-foundations");
    await expect(page.getByText("QA-ADMIN hide/restore probe.")).toHaveCount(0);

    await signIn(page, SEED.admin, "/admin/reviews");
    const hidden = page.locator("li").filter({ hasText: "QA-ADMIN hide/restore probe." });
    await paginateUntilVisible(page, hidden);
    await hidden.getByRole("button", { name: "Restore" }).click();
    await expect(hidden.getByText("VISIBLE")).toBeVisible();
  });

  test("unpublishing a course drops it from the learner cart badge", async ({ page, context }) => {
    await signIn(page, SEED.admin, "/admin/courses");
    await ensureCoursePublished(page, "SQL for Analysts");
    await context.clearCookies();

    await signIn(page, SEED.learner, "/courses/sql-for-analysts");
    const add = page.getByRole("button", { name: /add to cart/i });
    if (await add.isVisible()) {
      await add.click();
      await expect(page).toHaveURL(/\/cart/);
    } else {
      await page.goto("/cart");
    }
    const before = await cartBadgeCount(page);
    expect(before).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: /sql for analysts/i })).toBeVisible();

    await context.clearCookies();
    await signIn(page, SEED.admin, "/admin/courses");
    await adminSearch(page, "SQL for Analysts");
    const sql = page.locator("li").filter({ hasText: "SQL for Analysts" });
    await sql.getByRole("button", { name: "Unpublish", exact: true }).click();
    await expect(sql.getByText("Unpublished", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(sql.getByRole("button", { name: "Publish", exact: true })).toBeVisible();

    try {
      await context.clearCookies();
      await signIn(page, SEED.learner, "/cart");
      await expect(page.getByRole("heading", { level: 1, name: "Cart" })).toBeVisible();
      await expect(page.getByText(/sql for analysts/i)).toHaveCount(0);
      expect(await cartBadgeCount(page)).toBeLessThan(before);

      await page.goto("/courses");
      await expect(page.getByRole("link", { name: /sql for analysts/i })).toHaveCount(0);
    } finally {
      await context.clearCookies();
      await signIn(page, SEED.admin, "/admin/courses");
      await ensureCoursePublished(page, "SQL for Analysts");
    }
  });

  test("rejecting a pending bKash payment does not enrol and releases the coupon", async ({
    page,
    context,
  }) => {
    await signIn(page, SEED.admin, "/admin/courses");
    await ensureCoursePublished(page, "SQL for Analysts");
    await context.clearCookies();

    const trx = uniqueTrx("REJ");
    await signIn(page, SEED.learner, "/courses/sql-for-analysts/checkout?coupon=SAVE10");
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

    if (await page.getByText(/awaiting verification/i).isVisible()) {
      test.info().annotations.push({
        type: "note",
        description: "Seed learner already had a pending SQL payment; skipped new submit.",
      });
    } else {
      await expect(page.getByText(/SAVE10/i).first()).toBeVisible();
      await submitBkashCheckout(page, trx);
    }

    await context.clearCookies();
    await signIn(page, SEED.admin, "/admin/payments");
    await expect(page.getByRole("heading", { name: "Payment verification" })).toBeVisible();
    const card = page.getByRole("row").filter({ hasText: SEED.learner.email }).first();
    await paginateUntilVisible(page, card);
    await expect(card.getByText(/sql for analysts/i)).toBeVisible();
    await expect(card.getByText(/student picker|choose learner/i)).toHaveCount(0);

    const reason = card.getByLabel("Reason for rejection");
    await expect(reason).toHaveJSProperty("required", true);
    await expect(card.getByText(/not shown on the learner receipt/i)).toBeVisible();
    await expect(card.getByText(/the learner will see it/i)).toHaveCount(0);
    await reason.fill("QA reject — coupon should release.");
    await card.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText(SEED.learner.email)).toHaveCount(0, { timeout: 20_000 });

    await context.clearCookies();
    await signIn(page, SEED.learner, "/courses/sql-for-analysts/checkout?coupon=SAVE10");
    await expect(page.getByText(/you already have access/i)).toHaveCount(0);
    await expect(page.getByText(/SAVE10/i).first()).toBeVisible();
  });

  test("approving bKash enrols the paying user; refund revokes access", async ({
    page,
  }) => {
    await signIn(page, SEED.admin, "/admin/courses");
    await ensureCoursePublished(page, "SQL for Analysts");

    const trx = uniqueTrx("APV");
    await page.goto("/courses/sql-for-analysts/checkout");
    const alreadyEnrolled = page.getByText(/you already have access/i);
    const checkoutHeading = page.getByRole("heading", { name: "Checkout" });
    await expect(alreadyEnrolled.or(checkoutHeading)).toBeVisible();
    if (await page.getByText(/you already have access/i).isVisible()) {
      test.info().annotations.push({
        type: "note",
        description: "Admin already enrolled in SQL — refund path still exercised below.",
      });
    } else if (await page.getByText(/awaiting verification/i).isVisible()) {
      // Fall through to the queue and approve whatever is pending for this admin.
    } else {
      await submitBkashCheckout(page, trx);
    }

    await page.goto("/admin/payments");
    const card = page.getByRole("row").filter({ hasText: SEED.admin.email }).first();
    if (await findOnPagedList(page, card)) {
      await card.getByRole("button", { name: "Approve and enrol" }).click();
      await expect(page.getByText(SEED.admin.email)).toHaveCount(0, { timeout: 20_000 });
    }

    await page.goto("/dashboard");
    const showAll = page.getByText(/show all \d+ courses/i);
    if ((await showAll.count()) > 0) await showAll.click();
    const sqlLink = page.getByRole("link", { name: /sql for analysts/i });
    if ((await sqlLink.count()) === 0) {
      await page.getByRole("tab", { name: /completed/i }).click();
      if ((await showAll.count()) > 0) await showAll.click();
    }
    await expect(sqlLink.first()).toBeVisible();

    await page.goto("/admin/refunds");
    const order = page.locator("li").filter({ hasText: SEED.admin.email }).filter({
      hasText: /sql for analysts/i,
    });
    await paginateUntilVisible(page, order);
    await order.getByLabel("Reason").fill("QA refund — revoke access.");
    await order.getByRole("button", { name: "Refund and revoke access" }).click();
    await expect(order).toHaveCount(0, { timeout: 20_000 });

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /sql for analysts/i })).toHaveCount(0);

    await page.goto("/courses/sql-for-analysts/checkout");
    await expect(page.getByText(/you already have access/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  });

  test("admin tables do not overflow at 375 or 1280", async ({ page }) => {
    await signIn(page, SEED.admin, "/admin/users");

    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ["/admin/payments", "/admin/users", "/admin/courses", "/admin/refunds", "/admin/reviews"]) {
        await page.goto(path);
        await page.locator("h1").first().waitFor({ state: "visible", timeout: 20_000 });
        const metrics = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(
          metrics.scrollWidth,
          `${path} overflow at ${width}: ${metrics.scrollWidth} > ${metrics.clientWidth}`,
        ).toBeLessThanOrEqual(metrics.clientWidth + 1);
      }
    }
  });
});
