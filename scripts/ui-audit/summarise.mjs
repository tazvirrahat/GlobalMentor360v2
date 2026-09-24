// Rolls design-review/ui-audit/results.json up into one screen of findings.
import { readFileSync } from "node:fs";
import path from "node:path";

const rows = JSON.parse(readFileSync(path.resolve("design-review/ui-audit/results.json"), "utf8"));
const page = (r) => `${r.role}/${r.name}`;
const uniq = (list) => [...new Set(list)];

console.log(`${rows.length} page loads\n`);

console.log("Page health");
const bad = rows.filter((r) => r.error || (r.status >= 400 && r.name !== "not-found"));
console.log(
  bad.length
    ? bad.map((r) => `  ${page(r)}/${r.vp}: status=${r.status} ${r.error ?? ""} -> ${r.finalUrl ?? ""}`).join("\n")
    : "  every page loaded",
);

console.log("\nWCAG violations (axe: wcag2a, 2aa, 21a, 21aa, 22aa)");
const byRule = {};
for (const r of rows) {
  for (const v of r.axe ?? []) {
    byRule[v.id] ??= { impact: v.impact, help: v.help, pages: new Set(), nodes: 0, sample: v.sample };
    byRule[v.id].pages.add(page(r));
    byRule[v.id].nodes += v.nodes;
  }
}
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const rules = Object.entries(byRule).sort((a, b) => order[a[1].impact] - order[b[1].impact]);
if (!rules.length) console.log("  none");
for (const [id, v] of rules) {
  console.log(`  [${v.impact}] ${id}: ${v.help}`);
  console.log(`      ${v.nodes} nodes on ${v.pages.size} pages: ${[...v.pages].slice(0, 6).join(", ")}${v.pages.size > 6 ? " …" : ""}`);
  console.log(`      e.g. ${v.sample}`);
}

console.log("\nHorizontal overflow (WCAG 1.4.10 at 375px)");
const over = rows.filter((r) => r.overflowPx > 1);
console.log(
  over.length
    ? over.map((r) => `  ${page(r)}/${r.vp}: +${r.overflowPx}px ${(r.overflowers ?? []).slice(0, 2).map((o) => o.el).join(" | ")}`).join("\n")
    : "  none",
);

console.log("\nTargets under 24x24 (WCAG 2.5.8)");
const targets = {};
for (const r of rows) for (const t of r.smallTargets ?? []) (targets[t] ??= new Set()).add(`${page(r)}/${r.vp}`);
const targetList = Object.entries(targets).sort((a, b) => b[1].size - a[1].size);
console.log(`  ${targetList.length} distinct`);
for (const [t, p] of targetList.slice(0, 15)) console.log(`  ${String(p.size).padStart(3)}x  ${t}`);

console.log("\nText under 13px");
const tiny = rows.filter((r) => r.tinyText > 0).sort((a, b) => b.tinyText - a.tinyText);
console.log(tiny.length ? `  ${tiny.length} page loads` : "  none");
for (const r of tiny.slice(0, 5)) console.log(`  ${page(r)}/${r.vp}: ${r.tinyText} (${(r.tinySamples ?? []).join("; ")})`);

console.log("\nStructure");
console.log(`  no h1: ${uniq(rows.filter((r) => r.h1 === 0 && !r.error).map(page)).join(", ") || "none"}`);
console.log(`  more than one h1: ${uniq(rows.filter((r) => r.h1 > 1).map((r) => `${page(r)}(${r.h1})`)).join(", ") || "none"}`);
console.log(`  no <main>: ${uniq(rows.filter((r) => r.main === 0 && !r.error).map(page)).join(", ") || "none"}`);

console.log("\nConsole errors and failed requests (excluding the intentional 404 page)");
const errors = {};
for (const r of rows) {
  if (r.name === "not-found") continue;
  for (const e of [...(r.consoleErrors ?? []), ...(r.badResponses ?? [])]) (errors[e] ??= new Set()).add(page(r));
}
const errorList = Object.entries(errors);
console.log(errorList.length ? errorList.slice(0, 12).map(([e, p]) => `  ${p.size}x ${e.slice(0, 140)}`).join("\n") : "  none");

console.log("\nLongest pages on a phone");
for (const r of rows.filter((r) => r.vp === "phone" && r.height).sort((a, b) => b.height - a.height).slice(0, 6)) {
  console.log(`  ${String(r.height).padStart(6)}px  ${page(r)}`);
}
