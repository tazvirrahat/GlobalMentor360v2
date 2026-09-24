// Keyboard and reflow checks the automated scanner cannot do:
//  - 2.4.3 Focus Order: the first Tab reaches the skip link
//  - 2.4.7 Focus Visible: every tab stop shows an indicator
//  - 2.4.11 Focus Not Obscured (Minimum): nothing sits on top of the focused element
//  - 1.4.10 Reflow: no horizontal scroll at 320 CSS px (400% zoom of 1280px)
import { chromium } from "@playwright/test";
import { buildRoutes, lookupIds, signIn } from "./ids.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PICK = ["home", "catalog", "landing", "learn-article", "dashboard", "studio-course", "admin-payments"];

const ids = await lookupIds();
const routes = buildRoutes(ids).filter(([, name]) => PICK.includes(name));
// PLAYWRIGHT_CHROMIUM_PATH: use an installed Chromium instead of Playwright's download.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
let problems = 0;

try {
  for (const [role, name, route] of routes) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    if (role !== "public") await signIn(context, BASE, role);
    const page = await context.newPage();
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90_000 });

    const stops = [];
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        if (el.closest("nextjs-portal")) return null; // Next's dev overlay, not the app
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
        const ring = s.boxShadow && s.boxShadow !== "none";
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 10));
        const obscured = top && top !== el && !el.contains(top) && !top.contains(el);
        return {
          label: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("name") || el.tagName)
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 28),
          tag: el.tagName.toLowerCase(),
          visible: outline || ring,
          obscured: Boolean(obscured) && r.top < 120,
        };
      });
      if (info) stops.push(info);
    }

    const first = stops[0]?.label ?? "(none)";
    const noIndicator = stops.filter((s) => !s.visible);
    const obscured = stops.filter((s) => s.obscured);

    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForTimeout(300);
    const reflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    const skipFirst = /skip/i.test(first);
    problems += (skipFirst ? 0 : 1) + noIndicator.length + obscured.length + (reflow > 1 ? 1 : 0);

    console.log(`\n${role}/${name}`);
    console.log(`  first tab stop: "${first}" ${skipFirst ? "(skip link)" : "(NOT the skip link)"}`);
    console.log(`  ${stops.length} stops, ${noIndicator.length} without a visible focus indicator`);
    for (const s of noIndicator.slice(0, 5)) console.log(`     no indicator: <${s.tag}> "${s.label}"`);
    console.log(`  focus hidden under a sticky bar: ${obscured.length ? obscured.map((s) => `"${s.label}"`).join(", ") : "none"}`);
    console.log(`  reflow at 320px: ${reflow > 1 ? `FAILS, +${reflow}px horizontal scroll` : "passes"}`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${problems} keyboard/reflow problems`);
process.exitCode = problems ? 1 : 0;
