import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("design-review");
const LEARNER = { email: "learner@example.com", password: "dev-password-12345" };
const ADMIN = { email: "admin@example.com", password: "dev-password-12345" };

const publicShots = [
  { name: "home-375.png", path: "/", width: 375, height: 812 },
  { name: "home-768.png", path: "/", width: 768, height: 1024 },
  { name: "home-1440.png", path: "/", width: 1440, height: 900 },
  { name: "courses-1440.png", path: "/courses", width: 1440, height: 900 },
  { name: "sign-in-1440.png", path: "/sign-in", width: 1440, height: 900 },
  { name: "pub-catalog-1440.png", path: "/courses", width: 1440, height: 900 },
  { name: "pub-catalog-375.png", path: "/courses", width: 375, height: 812 },
  { name: "pub-landing-1440.png", path: "/courses/vol-big-course", width: 1440, height: 900 },
  { name: "pub-landing-375.png", path: "/courses/vol-big-course", width: 375, height: 812 },
  { name: "pub-signup-375.png", path: "/sign-up", width: 375, height: 812 },
];

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

async function shoot(page, name, width, height) {
  await page.setViewportSize({ width, height });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log("wrote", file);
}

try {
  for (const shot of publicShots) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
    await page.goto(new URL(shot.path, BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
    await shoot(page, shot.name, shot.width, shot.height);
    await page.close();
  }

  const session = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await session.goto(new URL("/sign-in", BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await session.getByLabel("Email").fill(LEARNER.email);
  await session.getByLabel("Password").fill(LEARNER.password);
  await session.getByRole("button", { name: /sign in/i }).click();
  await session.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20_000 });

  await session.goto(new URL("/courses/sql-for-analysts", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  const add = session.getByRole("button", { name: /add to cart/i });
  if ((await add.count()) > 0) {
    await add.click();
    await session.waitForURL(/\/cart/, { timeout: 20_000 });
  } else {
    await session.goto(new URL("/cart", BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  }
  await shoot(session, "pub-cart-1440.png", 1440, 900);

  await session.goto(new URL("/courses/sql-for-analysts/checkout", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await shoot(session, "pub-checkout-1440.png", 1440, 900);
  await shoot(session, "final-checkout.png", 1440, 900);

  await session.goto(new URL("/dashboard", BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await shoot(session, "final-dashboard.png", 1440, 900);
  const completed = session.getByRole("tab", { name: /completed/i });
  if ((await completed.count()) > 0) {
    await completed.click();
  }
  const certLink = session.getByRole("link", { name: /view certificate/i }).first();
  if ((await certLink.count()) > 0) {
    await certLink.click();
    await session.waitForURL(/\/certificates\//, { timeout: 20_000 });
    await session.waitForLoadState("networkidle");
    await shoot(session, "pub-cert-1440.png", 1440, 900);
  } else {
    console.log("skip pub-cert-1440.png (no certificate link on dashboard)");
  }

  await session.goto(new URL("/learn/typescript-foundations", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await session.waitForURL(/\/learn\/typescript-foundations\/[^/]+/, { timeout: 30_000 });
  await session.waitForLoadState("networkidle");
  await shoot(session, "final-player.png", 1440, 900);

  await session.close();

  const publicFinal = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await publicFinal.goto(new URL("/", BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await shoot(publicFinal, "final-home.png", 1440, 900);
  await publicFinal.goto(new URL("/courses", BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await shoot(publicFinal, "final-catalog.png", 1440, 900);
  await publicFinal.goto(new URL("/courses/vol-big-course", BASE).toString(), {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await shoot(publicFinal, "final-landing.png", 1440, 900);
  await publicFinal.close();

  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await admin.goto(new URL("/sign-in", BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await admin.getByLabel("Email").fill(ADMIN.email);
  await admin.getByLabel("Password").fill(ADMIN.password);
  await admin.getByRole("button", { name: /sign in/i }).click();
  await admin.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20_000 });
  await admin.goto(new URL("/admin/payments", BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
  await shoot(admin, "final-admin-payments.png", 1440, 900);
  await admin.close();
} finally {
  await browser.close();
}
