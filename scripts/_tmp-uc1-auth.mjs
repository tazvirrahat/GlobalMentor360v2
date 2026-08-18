import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const LEARNER_EMAIL = "learner@example.com";
const PASSWORD = "dev-password-12345";
const WRONG = "definitely-not-the-password";

const results = [];

function record(id, ok, detail) {
  results.push({ id, ok, detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

async function safe(id, fn) {
  try {
    await fn();
  } catch (error) {
    record(id, false, String(error?.message ?? error).slice(0, 400));
  }
}

const pageErrors = [];
const serverErrors = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: "en-GB",
});
const page = await context.newPage();

page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});
page.on("response", (response) => {
  if (response.status() >= 500) {
    serverErrors.push(`${response.status()} ${response.url()}`);
  }
});

try {
  await safe("home_loads", async () => {
    const res = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    if (!res || res.status() >= 400) throw new Error(`home HTTP ${res?.status()}`);
    await page.getByRole("link", { name: "Sign in" }).waitFor({ timeout: 15_000 });
    record("home_loads", true, `HTTP ${res.status()} ${page.url()}`);
  });

  await safe("click_header_sign_in", async () => {
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.waitForURL(/\/sign-in/, { timeout: 15_000 });
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    record("click_header_sign_in", true, page.url());
  });

  await safe("wrong_password_shows_error", async () => {
    const signInPost = page.waitForResponse(
      (res) => res.url().includes("/api/auth/sign-in/email") && res.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.getByLabel("Email").fill(LEARNER_EMAIL);
    await page.getByLabel("Password").fill(WRONG);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    const api = await signInPost;
    const errorCopy = page.getByText("Email or password is incorrect.");
    await errorCopy.waitFor({ timeout: 10_000 });
    const stayed = new URL(page.url()).pathname === "/sign-in";
    if (!stayed) throw new Error(`left sign-in: ${page.url()}`);
    record(
      "wrong_password_shows_error",
      true,
      `API ${api.status()}; stayed on /sign-in; vague error shown`,
    );
  });

  await safe("forgot_password_page_loads", async () => {
    await page.getByRole("link", { name: /forgot password/i }).click();
    await page.waitForURL(/\/forgot-password/, { timeout: 15_000 });
    await page.getByRole("heading", { name: /reset your password/i }).waitFor();
    await page.getByLabel("Email").waitFor();
    await page.getByRole("button", { name: /send reset link/i }).waitFor();
    record("forgot_password_page_loads", true, page.url());
  });

  await safe("forgot_password_submit_no_real_email", async () => {
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();
    const status = page.getByRole("status");
    await status.waitFor({ timeout: 15_000 });
    const text = (await status.innerText()).replace(/\s+/g, " ").trim();
    const ok = /check your email/i.test(text) && /if an account exists/i.test(text);
    if (!ok) throw new Error(`unexpected copy: ${text.slice(0, 240)}`);
    record("forgot_password_submit_no_real_email", true, "generic success, no mailbox required");
  });

  await safe("sign_in_learner", async () => {
    await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    await page.getByLabel("Email").fill(LEARNER_EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    const signInPost = page.waitForResponse(
      (res) => res.url().includes("/api/auth/sign-in/email") && res.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: /^sign in$/i }).click();
    const api = await signInPost;
    if (api.status() !== 200) throw new Error(`sign-in API ${api.status()}`);
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20_000 });
    const path = new URL(page.url()).pathname;
    if (path !== "/dashboard") throw new Error(`expected /dashboard, got ${path}`);
    record("sign_in_learner", true, `${path}; API ${api.status()}`);
  });

  await safe("get_session_authenticated", async () => {
    const sessionRes = await page.request.get(`${BASE}/api/auth/get-session`);
    const status = sessionRes.status();
    const body = await sessionRes.json().catch(() => null);
    const email = body?.user?.email ?? null;
    const hasSession = Boolean(body?.session);
    if (status !== 200) throw new Error(`HTTP ${status}`);
    if (!hasSession) throw new Error("response had no session");
    if (email !== LEARNER_EMAIL) throw new Error(`user email mismatch: ${email}`);
    record(
      "get_session_authenticated",
      true,
      `HTTP ${status}; user=${email}; session=yes; token omitted`,
    );
  });

  await safe("account_sessions_list", async () => {
    const accountLinks = page.locator("header").getByRole("link", { name: "Account" });
    const linkCount = await accountLinks.count();
    const vis = [];
    for (let i = 0; i < linkCount; i += 1) {
      const loc = accountLinks.nth(i);
      vis.push({
        i,
        visible: await loc.isVisible(),
        box: await loc.boundingBox(),
        className: await loc.getAttribute("class"),
        ariaLabel: await loc.getAttribute("aria-label"),
      });
    }
    record(
      "account_header_link_count",
      linkCount === 1,
      `getByRole Account count=${linkCount} ${JSON.stringify(vis)}`,
    );
    const visible = accountLinks.locator("visible=true");
    const visibleCount = await visible.count();
    if (visibleCount >= 1) {
      await visible.first().click();
    } else {
      await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
    }
    await page.getByRole("heading", { name: "Account" }).waitFor();
    await page.getByRole("heading", { name: "Sessions" }).waitFor();
    const current = page.getByText("This device");
    await current.waitFor({ timeout: 10_000 });
    const currentBadge = page.getByText("Current", { exact: true });
    const currentCount = await currentBadge.count();
    if (currentCount < 1) throw new Error("no Current session badge");
    const revokeOthers = page.getByRole("button", { name: /revoke other sessions|sign out other/i });
    const hasRevokeOthers = (await revokeOthers.count()) > 0;
    record(
      "account_sessions_list",
      true,
      `This device + Current badge (${currentCount}); revoke-others=${hasRevokeOthers}`,
    );
  });

  await safe("learner_cannot_open_admin", async () => {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => !url.pathname.startsWith("/admin"), { timeout: 15_000 });
    const path = new URL(page.url()).pathname;
    const adminLink = await page.getByRole("link", { name: "Admin" }).count();
    if (path !== "/") throw new Error(`expected /, got ${page.url()}`);
    if (adminLink !== 0) throw new Error("Admin nav still visible for learner");
    record("learner_cannot_open_admin", true, `redirected to ${path}; Admin link count=${adminLink}`);
  });

  await safe("learner_cannot_open_studio", async () => {
    await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => !url.pathname.startsWith("/studio"), { timeout: 15_000 });
    const path = new URL(page.url()).pathname;
    const studioLink = await page.getByRole("link", { name: "Studio" }).count();
    if (path !== "/") throw new Error(`expected /, got ${page.url()}`);
    if (studioLink !== 0) throw new Error("Studio nav still visible for learner");
    record("learner_cannot_open_studio", true, `redirected to ${path}; Studio link count=${studioLink}`);
  });

  await safe("no_5xx_or_pageerror", async () => {
    if (serverErrors.length) throw new Error(serverErrors.slice(0, 5).join(" | "));
    if (pageErrors.length) throw new Error(pageErrors.slice(0, 5).join(" | "));
    record("no_5xx_or_pageerror", true, "clean");
  });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log("\n=== CHECKLIST ===");
for (const row of results) {
  console.log(`${row.ok ? "[x]" : "[ ]"} ${row.id}  ${row.detail}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
if (failed.length) process.exit(1);
