import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("design-review");
const PASSWORD = "dev-password-12345";

async function signIn(page, email, nextPath) {
  const next = `/sign-in?next=${encodeURIComponent(nextPath)}`;
  await page.goto(new URL(next, BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20_000 });
}

async function shot(page, name) {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("wrote", file);
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

try {
  const instructor = await browser.newContext();
  const studio = await instructor.newPage();
  await signIn(studio, "instructor@example.com", "/studio?page=2");

  await studio.setViewportSize({ width: 1440, height: 900 });
  await studio.goto(new URL("/studio?page=2", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await shot(studio, "back-studio-1440.png");

  await studio.setViewportSize({ width: 375, height: 812 });
  await studio.goto(new URL("/studio?page=2", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await shot(studio, "back-studio-375.png");

  await studio.setViewportSize({ width: 1440, height: 900 });
  await studio.goto(new URL("/studio", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  const firstCourse = studio.locator("main section").first().locator("ul li a").first();
  await firstCourse.click();
  await studio.getByRole("link", { name: /edit curriculum/i }).click();
  await studio.getByRole("heading", { name: "Curriculum" }).waitFor({ timeout: 20_000 });
  await shot(studio, "back-curriculum-1440.png");

  await studio.goto(new URL("/studio/qa", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await shot(studio, "back-qa-1440.png");

  await studio.goto(new URL("/studio/coupons", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await shot(studio, "back-coupons-1440.png");
  await instructor.close();

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, "admin@example.com", "/admin/payments");

  await admin.setViewportSize({ width: 1440, height: 900 });
  await admin.goto(new URL("/admin/payments", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await shot(admin, "back-admin-payments-1440.png");

  await admin.goto(new URL("/admin/users", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await shot(admin, "back-admin-users-1440.png");

  await admin.goto(new URL("/admin/refunds", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await shot(admin, "back-admin-refunds-1440.png");
  await adminCtx.close();
} finally {
  await browser.close();
}
