import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("design-review");

const shots = [
  { name: "p1-signin-1440.png", path: "/sign-in" },
  { name: "p1-catalog-empty-1440.png", path: "/courses?q=zzznomatchxyz" },
  { name: "p1-landing-1440.png", path: "/courses/vol-big-course" },
  { name: "p1-home-1440.png", path: "/" },
];

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(new URL(shot.path, BASE).toString(), { waitUntil: "networkidle", timeout: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const file = path.join(OUT, shot.name);
    await page.screenshot({ path: file, fullPage: true });
    console.log("wrote", file);
    await page.close();
  }
} finally {
  await browser.close();
}
