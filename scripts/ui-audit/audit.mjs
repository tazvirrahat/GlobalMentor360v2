// UI audit. Read-only against the app: visits every route as the role that can
// see it, at desktop and phone widths, and records objective problems next to a
// full-page screenshot. See README.md for what each check maps to in WCAG 2.2.
//
//   npm run ui-audit            (dev server on :3000, seeded database)
//   ONLY=home,catalog npm run ui-audit
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { buildRoutes, lookupIds, signIn } from "./ids.mjs";

const require = createRequire(import.meta.url);
const AXE = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = path.resolve("design-review/ui-audit");

const VIEWPORTS = [
  { tag: "desk", width: 1440, height: 900 },
  { tag: "phone", width: 375, height: 812 },
];

// Spec minimum is 13px; anything smaller is reported.
const MIN_TEXT_PX = 13;

/** Runs inside the page. Measures what axe does not. */
function measure(minTextPx) {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const out = {
    overflowPx: Math.max(0, doc.scrollWidth - vw),
    overflowers: [],
    smallTargets: [],
    tinyText: 0,
    tinySamples: [],
    h1: document.querySelectorAll("h1").length,
    main: document.querySelectorAll("main, [role=main]").length,
    height: doc.scrollHeight,
    title: document.title,
  };

  if (out.overflowPx > 1) {
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed") {
        const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
        out.overflowers.push({ el: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}`.slice(0, 110), right: Math.round(r.right) });
        if (out.overflowers.length >= 6) break;
      }
    }
  }

  // WCAG 2.5.8 Target Size (Minimum): 24x24 CSS px. Inline links in running text are exempt.
  const interactive = document.querySelectorAll(
    "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link]",
  );
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || s.visibility === "hidden" || s.display === "none") continue;
    // Visually hidden controls (skip link at rest, Radix native selects) are not targets.
    if (el.closest(".sr-only") || (s.position === "absolute" && s.clip !== "auto")) continue;
    if (el.tagName === "A" && s.display === "inline" && el.closest("p, li")) continue;
    if (r.width < 24 || r.height < 24) {
      const label = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30);
      out.smallTargets.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} "${label}"`);
    }
  }

  for (const el of document.querySelectorAll("body *")) {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    if (el.getBoundingClientRect().width === 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minTextPx) {
      out.tinyText += 1;
      if (out.tinySamples.length < 5) out.tinySamples.push(`${size}px "${el.textContent.trim().slice(0, 30)}"`);
    }
  }
  return out;
}

const ids = await lookupIds();
const routes = buildRoutes(ids);
await mkdir(path.join(OUT, "shots"), { recursive: true });

// PLAYWRIGHT_CHROMIUM_PATH: use an installed Chromium instead of Playwright's download.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
const results = [];

try {
  const roles = [...new Set(routes.map(([role]) => role))];
  for (const role of roles) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      if (role !== "public") await signIn(context, BASE, role);

      for (const [, name, route] of routes.filter(([r]) => r === role)) {
        const page = await context.newPage();
        const consoleErrors = [];
        const badResponses = [];
        page.on("console", (m) => {
          if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
        });
        page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
        page.on("response", (r) => {
          if (r.status() >= 400 && !r.url().includes("_next/webpack-hmr")) {
            badResponses.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 90)}`);
          }
        });

        const row = { role, vp: vp.tag, name, route };
        try {
          const resp = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90_000 });
          row.status = resp?.status();
          row.finalUrl = page.url().replace(BASE, "");
          await page.waitForTimeout(400);
          Object.assign(row, await page.evaluate(measure, MIN_TEXT_PX));

          await page.addScriptTag({ content: AXE });
          row.axe = await page.evaluate(async () => {
            const r = await window.axe.run(
              { exclude: [["nextjs-portal"]] },
              { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } },
            );
            return r.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.length,
              help: v.help,
              sample: v.nodes[0]?.target?.join(" "),
            }));
          });

          await page.screenshot({ path: path.join(OUT, "shots", `${role}-${name}-${vp.tag}.png`), fullPage: true });
        } catch (e) {
          row.error = String(e.message).slice(0, 200);
        }
        row.consoleErrors = consoleErrors;
        row.badResponses = badResponses;
        results.push(row);
        console.log(
          `${role.padEnd(10)} ${vp.tag.padEnd(5)} ${name.padEnd(18)} status=${row.status ?? "ERR"} axe=${(row.axe ?? []).length} overflow=${row.overflowPx ?? "?"} small=${(row.smallTargets ?? []).length} tiny=${row.tinyText ?? "?"}`,
        );
        await page.close();
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`wrote ${path.join(OUT, "results.json")}`);
}
