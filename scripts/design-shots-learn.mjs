import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("design-review");
const PASSWORD = "dev-password-12345";

const VOL = { email: "vol-learner@example.com", password: PASSWORD };
const LEARNER = { email: "learner@example.com", password: PASSWORD };
const EMPTY = { email: "verify-empty@example.com", password: PASSWORD };

async function signIn(page, account) {
  await page.goto(new URL("/sign-in", BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20_000 });
}

async function shot(page, name, width, height, pathname) {
  await page.setViewportSize({ width, height });
  await page.goto(new URL(pathname, BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("wrote", file);
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

try {
  const volPage = await browser.newPage();
  await signIn(volPage, VOL);
  await shot(volPage, "learn-dashboard-1440.png", 1440, 900, "/dashboard");
  await shot(volPage, "learn-dashboard-375.png", 375, 812, "/dashboard");
  await shot(volPage, "learn-orders-1440.png", 1440, 900, "/orders");
  await shot(volPage, "learn-notifications-1440.png", 1440, 900, "/notifications");
  await volPage.close();

  const learnerPage = await browser.newPage();
  await signIn(learnerPage, LEARNER);
  await shot(learnerPage, "learn-account-1440.png", 1440, 900, "/account");
  await learnerPage.setViewportSize({ width: 1440, height: 900 });
  await learnerPage.goto(new URL("/learn/typescript-foundations", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await learnerPage.waitForURL(/\/learn\/typescript-foundations\/[^/]+/, { timeout: 30_000 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  await learnerPage.screenshot({ path: path.join(OUT, "learn-player-1440.png"), fullPage: true });
  console.log("wrote", path.join(OUT, "learn-player-1440.png"));
  await learnerPage.setViewportSize({ width: 375, height: 812 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  await learnerPage.screenshot({ path: path.join(OUT, "learn-player-375.png"), fullPage: true });
  console.log("wrote", path.join(OUT, "learn-player-375.png"));
  await learnerPage.close();

  const emptyPage = await browser.newPage();
  try {
    await signIn(emptyPage, EMPTY);
    await shot(emptyPage, "learn-dashboard-empty-1440.png", 1440, 900, "/dashboard");
  } catch (error) {
    console.warn(
      "verify-empty@example.com sign-in failed; empty dashboard shot skipped.",
    );
    console.warn(String(error));
  }
  await emptyPage.close();

  const anon = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await shot(anon, "learn-404-1440.png", 1440, 900, "/this-page-does-not-exist");
  await anon.close();
} finally {
  await browser.close();
}
