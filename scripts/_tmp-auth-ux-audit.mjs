/**
 * One-shot AUTH UX walk against a running Next server.
 * Does not change seed passwords. Prints a JSON report.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
const EMAIL = "learner@example.com";
const PASSWORD = "dev-password-12345";
const WRONG = "definitely-not-the-seed-password";

const findings = [];
function note(id, status, detail) {
  findings.push({ id, status, detail });
  console.log(`[${status}] ${id}: ${detail}`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM,
});
const context = await browser.newContext({
  baseURL: BASE,
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

async function textOrNull(locator) {
  try {
    const n = await locator.count();
    if (!n) return null;
    return (await locator.first().innerText()).trim();
  } catch {
    return null;
  }
}

try {
  // --- 1. Sign-in page ---
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^sign in$/i }).waitFor();
  const heading = await textOrNull(page.getByRole("heading", { name: /welcome back/i }));
  const forgot = await page.getByRole("link", { name: /forgot password/i }).count();
  note(
    "sign-in-page",
    heading && forgot ? "PASS" : "FAIL",
    `heading=${JSON.stringify(heading)} forgotLink=${forgot}`,
  );

  // --- 2. Wrong password ---
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(WRONG);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  const alert = page.getByRole("alert");
  await alert.waitFor({ timeout: 15_000 }).catch(() => {});
  const alertText = await textOrNull(alert);
  const stillOnSignIn = new URL(page.url()).pathname === "/sign-in";
  const passwordLeaked = /password=/i.test(page.url());
  const vague =
    /email or password is incorrect/i.test(alertText ?? "") &&
    !/no such|not found|doesn't exist/i.test(alertText ?? "");
  note(
    "wrong-password",
    stillOnSignIn && vague && !passwordLeaked ? "PASS" : "FAIL",
    `url=${page.url()} leaked=${passwordLeaked} alert=${JSON.stringify(alertText)}`,
  );

  // --- 3. Happy sign-in ---
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20_000 });
  note(
    "sign-in-success",
    /\/dashboard/.test(page.url()) ? "PASS" : "WARN",
    `landed=${page.url()} heading=${JSON.stringify(await textOrNull(page.getByRole("heading").first()))}`,
  );

  const headerText = await page.getByRole("banner").innerText();
  const hasStudio = /\bStudio\b/.test(headerText);
  const hasAdmin = /\bAdmin\b/.test(headerText);
  const hasAccount = /\bAccount\b/.test(headerText);
  const hasSignOutInHeader = /Sign out/i.test(headerText);
  note(
    "session-header",
    hasAccount && !hasStudio && !hasAdmin ? "PASS" : "FAIL",
    `account=${hasAccount} studio=${hasStudio} admin=${hasAdmin} signOutInHeader=${hasSignOutInHeader}`,
  );

  // --- 4. /account ---
  await page.goto("/account", { waitUntil: "domcontentloaded" });
  const accountHeading = await textOrNull(page.getByRole("heading", { name: /^account$/i }));
  const thisDevice = await textOrNull(page.getByText(/this device/i));
  const signOutThis = await page.getByRole("button", { name: /^sign out$/i }).count();
  const signOutOthers = await page.getByRole("button", { name: /sign out other devices/i }).count();
  const currentEmail = await textOrNull(page.getByText(/learner@example.com/i));
  note(
    "account-page",
    accountHeading && thisDevice && currentEmail && signOutThis > 0 ? "PASS" : "FAIL",
    `heading=${JSON.stringify(accountHeading)} thisDevice=${JSON.stringify(thisDevice)} email=${JSON.stringify(currentEmail)} signOutThis=${signOutThis} signOutOthers=${signOutOthers}`,
  );

  await page.getByLabel("Current password").fill("definitely-not-the-seed");
  await page.getByLabel("New password", { exact: true }).fill("another-dev-password-999");
  await page.getByLabel("Confirm new password").fill("another-dev-password-999");
  await page.getByRole("button", { name: /update password/i }).click();
  const status = page.getByRole("status");
  await status.waitFor({ timeout: 15_000 }).catch(() => {});
  const statusText = await textOrNull(status);
  const passwordRefused = Boolean(statusText) && !/updated|saved|changed/i.test(statusText);
  note(
    "account-wrong-current-password",
    passwordRefused ? "PASS" : "FAIL",
    `status=${JSON.stringify(statusText)}`,
  );

  // --- 5. forgot-password (signed in still ok) ---
  await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
  const fpHeading = await textOrNull(page.getByRole("heading"));
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: /send reset link/i }).click();
  const fpStatus = page.getByRole("status");
  await fpStatus.waitFor({ timeout: 15_000 }).catch(() => {});
  const fpText = await textOrNull(fpStatus);
  note(
    "forgot-password",
    /check your email/i.test(fpText ?? "") || /if an account exists/i.test(fpText ?? "")
      ? "PASS"
      : "FAIL",
    `heading=${JSON.stringify(fpHeading)} afterSubmit=${JSON.stringify(fpText)}`,
  );

  const sesCopy =
    /sandbox|may not|contact (the )?academy|spam|server terminal/i.test(fpText ?? "");
  note(
    "forgot-password-ses-honesty",
    sesCopy ? "PASS" : "P1",
    `copy mentions delivery limits/spam/support? ${sesCopy}. text=${JSON.stringify(fpText)}`,
  );

  // --- 6. learner blocked from /admin and /studio ---
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await page.waitForURL((u) => !u.pathname.startsWith("/admin"), { timeout: 15_000 }).catch(() => {});
  const adminUrl = page.url();
  const adminBlocked = !new URL(adminUrl).pathname.startsWith("/admin");
  note("learner-blocked-admin", adminBlocked ? "PASS" : "FAIL", `url=${adminUrl}`);

  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await page.waitForURL((u) => !u.pathname.startsWith("/studio"), { timeout: 15_000 }).catch(() => {});
  const studioUrl = page.url();
  const studioBlocked = !new URL(studioUrl).pathname.startsWith("/studio");
  note("learner-blocked-studio", studioBlocked ? "PASS" : "FAIL", `url=${studioUrl}`);

  // --- 7. sign-up copy (signed out not required) ---
  await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
  const suHeading = await textOrNull(page.getByRole("heading"));
  const suBody = await page.locator("main").innerText();
  const suPromisesInbox = /check your email|we('ll| will) send/i.test(suBody);
  const suMentionsLimits = /sandbox|may not|contact the academy|spam/i.test(suBody);
  note(
    "sign-up-copy",
    suHeading ? "INFO" : "FAIL",
    `heading=${JSON.stringify(suHeading)} promisesInbox=${suPromisesInbox} mentionsLimits=${suMentionsLimits}`,
  );

  // --- 8. reset-password without token ---
  await page.goto("/reset-password", { waitUntil: "domcontentloaded" });
  const resetAlert = await textOrNull(page.getByRole("alert"));
  note(
    "reset-password-no-token",
    /invalid or expired/i.test(resetAlert ?? "") ? "PASS" : "FAIL",
    `alert=${JSON.stringify(resetAlert)}`,
  );

  // --- 9. sign-out from dashboard ---
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const dashSignOut = page.getByRole("button", { name: /^sign out$/i });
  const dashHasSignOut = (await dashSignOut.count()) > 0;
  note("dashboard-sign-out-control", dashHasSignOut ? "PASS" : "FAIL", `present=${dashHasSignOut}`);
  if (dashHasSignOut) {
    await dashSignOut.click();
    await page.waitForURL(/\/sign-in/, { timeout: 15_000 });
    note("sign-out", page.url().includes("/sign-in") ? "PASS" : "FAIL", `url=${page.url()}`);
    await page.goto("/account", { waitUntil: "domcontentloaded" });
    note(
      "session-cleared",
      page.url().includes("/sign-in") ? "PASS" : "FAIL",
      `accountRedirect=${page.url()}`,
    );
  }

  note(
    "console-errors",
    consoleErrors.length === 0 ? "PASS" : "WARN",
    consoleErrors.slice(0, 8).join(" | ") || "none",
  );
} catch (err) {
  note("crash", "FAIL", err instanceof Error ? err.stack ?? err.message : String(err));
} finally {
  await browser.close();
}

writeFileSync("scripts/_tmp-auth-ux-audit.json", JSON.stringify({ base: BASE, findings }, null, 2));
const p0 = findings.filter((f) => f.status === "FAIL");
console.log(`\nDone. ${findings.length} checks, ${p0.length} FAIL. Report: scripts/_tmp-auth-ux-audit.json`);
process.exit(p0.length ? 1 : 0);
