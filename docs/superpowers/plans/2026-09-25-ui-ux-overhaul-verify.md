# UI/UX overhaul, plan 7: verification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the UI/UX work meets spec §11 (definition of done) and close the §13 risks that belong to it, fixing whatever the checks turn up. No new features.

**Architecture:** Checks, not code. Each task runs one §11 criterion, records the number, and fixes what fails in the smallest change that makes it pass. Anything that is a feature rather than a defect goes to plan 8+.

**Spec:** §11, §13. Plans 1–6 are done.

## Global Constraints

- A fix never widens scope: if a check exposes a missing feature, log it for §12 instead.
- Every number that goes in the progress log comes from a run in this plan, not from an earlier phase.
- The dev database is read only here (screenshots use it; nothing writes to it).

---

### Task 1: Banned patterns (§11 grep)

- [x] `grep` app/components/lib for: `#0e4f56`, `#c2410c`, `Fraunces`, `Reveal`, `uppercase` with `tracking`, `→` in JSX text, ` · ` joins in JSX, and the retired tokens `muted-foreground|font-heading|tracking-tight|text-primary|bg-card|shadow-sm|text-destructive|text-success|text-warning|bg-muted|border-border` in page code.
- [x] Fix each hit (or record why it is not a hit: a comment, a test fixture, a non-UI string).
- [x] Commit `Remove the last banned patterns`.

### Task 2: Phone checks (§11)

- [x] Player on a 375×812 phone, on a lecture (not the quiz gate): the lesson and its Complete / Next action are inside the first 812px.
- [x] Catalog on a phone, full first page: ≤ 3,000px tall.
- [x] Fix and commit if either fails.

### Task 3: Keyboard and sheets (§11)

- [x] `npm run ui-audit:keyboard`: skip link first, 0 stops without a visible indicator, nothing under a sticky bar, 320px reflow.
- [x] Sheets trap focus: the site phone Menu, the player Contents sheet and the app-shell Menu keep Tab inside while open and return focus to their trigger on Escape (script).

### Task 4: Screenshots by eye (§11)

- [x] Every audited route at 1440 and 375 (the audit's own shots plus a 1440 pass), looked at against spec §4–§6. Fix what reads wrong.

### Task 5: §13 leftovers

- [x] Old screenshot scripts that point at fixture slugs from before the data reset (`scripts/design-shots*.mjs`, `scripts/p1-shots.mjs`, `scripts/verify-pages.ts`): update to the seed's slugs or retire them.
- [x] `৳` rendering: already checked on Linux in plan 3; Windows is still unchecked — record it as open.

### Task 6: Full suites and audit

- [x] lint (0 errors), typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build.
- [x] `npm run ui-audit` + summary: all routes, both viewports: 0 axe, 0 text < 13px, 0 overflow, 0 targets < 24px, no console errors.
- [x] Progress log row with the numbers; commit; push.
