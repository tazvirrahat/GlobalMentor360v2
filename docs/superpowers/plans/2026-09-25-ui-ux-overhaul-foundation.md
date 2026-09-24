# UI/UX overhaul, plan 1: foundation, tokens and type

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get test fixtures out of the dev database, give the tests their own database, bring the audit harness into the repo, and replace the teal/amber/Fraunces look with the new ink/verified/seal tokens and Schibsted Grotesk across every existing page.

**Architecture:** Tests, e2e and the volume fixture move to a `globalmentor360_test` database. A guard refuses to run them against any database whose name does not end in `_test`. The dev database is reset (only with the user's consent) and reseeded with believable content. The visual change is done at the token layer first: shadcn variables, the Tailwind `@theme` type scale, radius, shadow and the focus ring all change in `app/globals.css`. Every page picks up the new look before any page is rewritten. Later plans (shells, pages) build on this.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, Tailwind v4 (`@theme inline`), shadcn on `radix-ui`, Prisma 7.9 + `@prisma/adapter-pg`, Better Auth 1.6, Vitest 4, Playwright 1.62, axe-core.

**Spec:** `docs/superpowers/specs/2026-09-25-ui-ux-overhaul-design.md` (read it first).

## Global Constraints

- Read `node_modules/next/dist/docs/` for any Next API before using it (AGENTS.md). Fonts: `01-app/01-getting-started/13-fonts.md` and `01-app/03-api-reference/02-components/font.md`.
- `npm run db:migrate` only against dev. **Never `db:push`.** Test DB uses `prisma migrate deploy`.
- Destructive dev DB reset requires the user's explicit consent in chat. Prisma's AI guard needs their consent text in `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- Never print `.env` values. Never commit `.env`.
- Seed accounts keep their emails and names: `learner@example.com` (Sam Learner), `instructor@example.com` (Dana Instructor), `admin@example.com` (Alex Admin), password `dev-password-12345`. Seed coupon `SAVE10`.
- Slugs `typescript-foundations` (BDT 599000 minor, USD 4900) and `sql-for-analysts` (BDT 399000, USD 3900) keep their prices. e2e specs depend on them.
- **No Bangla font.** Fonts are Schibsted Grotesk (everything) and IBM Plex Mono (serials, transaction IDs, coupon and order codes only).
- Colours (exact): paper `#fcfcfd`, surface `#ffffff`, ink `#1d2242`, graphite `#5e6376`, rule `#e3e5ec`, control `#8a8fa3`, wash `#f3f4f7`, mark `#f6e35a`, verified `#0b5d46`, seal `#d2303f`, caution `#8a5a00` on caution-wash `#fbf1d6`.
- Minimum text size 13px. Targets ≥ 24×24. Focus: 2px `--ring` outline, 2px offset.
- Commit on `claude/ui-ux-overhaul`, push after each task. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Keep the user updates short (see memory `work-quietly`).

## File map

| File | Change | Responsibility |
|---|---|---|
| `eslint.config.mjs` | modify | ignore `.cursor/**`, `.next-*/**`, `.superpowers/**`, `design-review/**` |
| `app/learn/[slug]/video-player.tsx` | modify | read the stored speed without setState-in-effect |
| `app/studio/coupons/actions.ts` | modify | `prefer-const` |
| `scripts/_tmp-*`, `scripts/tmp-*` | delete | Cursor one-off scripts (kept in git history) |
| `lib/test-database.ts` + `lib/test-database.test.ts` | create | derive and guard the test DB URL (pure) |
| `scripts/use-test-db.ts` | create | side-effect import: point `DATABASE_URL` at the test DB |
| `scripts/test-db-prepare.ts` | create | create the test DB, migrate, seed |
| `tests/integration/setup.ts` | modify | switch to the test DB, then guard |
| `package.json` | modify | `db:test:prepare`, SQL suites on the test DB, `ui-audit`, axe-core devDep |
| `playwright.config.ts`, `e2e/qa-learner.spec.ts` | modify | e2e server on :3100 with the test DB |
| `scripts/seed-volume.ts` | modify | test DB only |
| `prisma/seed-content.ts` + `prisma/seed-content.test.ts` | create | the believable catalog as data |
| `prisma/seed.ts` | rewrite | data-driven, idempotent seed |
| `scripts/ui-audit/*` | create | audit harness in the repo |
| `lib/design-tokens.ts` + `lib/design-tokens.test.ts` | create | palette + WCAG contrast proofs + drift check against globals.css |
| `app/globals.css` | rewrite | tokens, type scale, radius, shadow, focus ring |
| `app/layout.tsx` | modify | fonts |
| `components/ui/*` | modify | variants on the new tokens |
| `components/site/reveal.tsx` | delete | scroll reveals are banned |
| `design-system/MASTER.md` | replace | pointer to the spec |

---

## Phase 0: foundation

### Task 1: Lint to zero and remove Cursor leftovers

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `app/learn/[slug]/video-player.tsx:3,47-61,211-216`
- Modify: `app/studio/coupons/actions.ts:46`
- Delete: `scripts/_tmp-auth-ux-audit.json`, `scripts/_tmp-auth-ux-audit.mjs`, `scripts/_tmp-check-users.sql`, `scripts/_tmp-qa3-progress.mjs`, `scripts/_tmp-uc1-auth.mjs`, `scripts/tmp-audit-pending.sql`, `scripts/tmp-money-click.mjs`, `scripts/tmp-ui-audit-html.mjs`, `scripts/tmp-ui-audit-one.mjs`, `scripts/tmp-ui-audit-prices.sql`, `scripts/tmp-ui-audit-probe.mjs`, `scripts/tmp-ui-audit-raw.mjs`

**Interfaces:** none produced.

- [ ] **Step 1: See the current failures**

Run: `npm run lint 2>&1 | tail -5`
Expected: `✖ 17 problems (17 errors, …)`. 15 are in `.cursor/skills/**`, 1 in `video-player.tsx:54`, 1 in `coupons/actions.ts:46`.

- [ ] **Step 2: Ignore tooling folders**

In `eslint.config.mjs` replace the ignores line with:

```js
    ignores: [
      "generated/**",
      ".next/**",
      ".next-*/**",
      "node_modules/**",
      "globalmentor360/**",
      ".claude/**",
      ".cursor/**",
      ".superpowers/**",
      "design-review/**",
    ],
```

- [ ] **Step 3: Read the stored playback speed without setState in an effect**

In `video-player.tsx`, change the React import to
`import { useEffect, useRef, useState, useSyncExternalStore } from "react";` and add below `SPEEDS`:

```ts
function readStoredSpeed(): number {
  const stored = Number(window.localStorage.getItem(SPEED_KEY));
  return SPEEDS.includes(stored) ? stored : 1;
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
```

Replace `const [speed, setSpeed] = useState(1);` and the two speed effects (lines 47 and 52-61) with:

```ts
  // The remembered speed is external state (localStorage), so it is read with
  // useSyncExternalStore; the server snapshot is 1x, which is what SSR renders.
  const storedSpeed = useSyncExternalStore(subscribeToStorage, readStoredSpeed, () => 1);
  const [chosenSpeed, setChosenSpeed] = useState<number | null>(null);
  const speed = chosenSpeed ?? storedSpeed;

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.playbackRate = speed;
  }, [speed]);
```

Replace the select's `onChange` (line ~215) with:

```tsx
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setChosenSpeed(next);
                  window.localStorage.setItem(SPEED_KEY, String(next));
                }}
```

If anything else in the file calls `setSpeed`, run `grep -n setSpeed` and route it through the same two lines.

- [ ] **Step 4: prefer-const**

`app/studio/coupons/actions.ts:46`: check with `grep -n "courseId =" app/studio/coupons/actions.ts` that `courseId` is never reassigned. Then change `let courseId = scope.courseId;` to `const courseId = scope.courseId;`.

- [ ] **Step 5: Delete the one-off scripts**

```bash
git rm -q scripts/_tmp-auth-ux-audit.json scripts/_tmp-auth-ux-audit.mjs scripts/_tmp-check-users.sql scripts/_tmp-qa3-progress.mjs scripts/_tmp-uc1-auth.mjs scripts/tmp-audit-pending.sql scripts/tmp-money-click.mjs scripts/tmp-ui-audit-html.mjs scripts/tmp-ui-audit-one.mjs scripts/tmp-ui-audit-prices.sql scripts/tmp-ui-audit-probe.mjs scripts/tmp-ui-audit-raw.mjs
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: lint 0 errors; tsc clean; unit suite green (322 tests).
Then load a video lecture in the dev preview. Speed select shows 1x. Pick 1.5x and reload: 1.5x persists. There are no hydration warnings in the console. If no video lecture exists locally, say so in the report instead of claiming this was checked.

- [ ] **Step 7: Commit**

```bash
git add -A eslint.config.mjs "app/learn/[slug]/video-player.tsx" app/studio/coupons/actions.ts scripts
git commit -m "Bring lint to zero and drop Cursor one-off scripts"
```

---

### Task 2: A test database the suites cannot mistake for dev

**Files:**
- Create: `lib/test-database.ts`, `lib/test-database.test.ts`, `scripts/use-test-db.ts`, `scripts/test-db-prepare.ts`
- Modify: `tests/integration/setup.ts`, `package.json`

**Interfaces:**
- Produces: `deriveTestDatabaseUrl(url: string): string` (appends `_test` to the database name, idempotent); `assertTestDatabaseUrl(url: string): void` (throws unless the database name ends in `_test`); `testDatabaseUrl(env?: NodeJS.ProcessEnv): string` (`TEST_DATABASE_URL`, else derived from `DATABASE_URL`, then asserted). `scripts/use-test-db.ts` sets `process.env.DATABASE_URL = testDatabaseUrl()` as a side effect. Tasks 3 and 5 import it.

- [ ] **Step 1: Write the failing test**

`lib/test-database.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl, deriveTestDatabaseUrl, testDatabaseUrl } from "./test-database";

const DEV = "postgresql://postgres:postgres@localhost:5432/globalmentor360?schema=public";

describe("deriveTestDatabaseUrl", () => {
  it("appends _test to the database name and keeps the query", () => {
    expect(deriveTestDatabaseUrl(DEV)).toBe(
      "postgresql://postgres:postgres@localhost:5432/globalmentor360_test?schema=public",
    );
  });

  it("is idempotent", () => {
    const once = deriveTestDatabaseUrl(DEV);
    expect(deriveTestDatabaseUrl(once)).toBe(once);
  });
});

describe("assertTestDatabaseUrl", () => {
  it("refuses the dev database", () => {
    expect(() => assertTestDatabaseUrl(DEV)).toThrow(/_test/);
  });

  it("accepts a _test database", () => {
    expect(() => assertTestDatabaseUrl(deriveTestDatabaseUrl(DEV))).not.toThrow();
  });
});

describe("testDatabaseUrl", () => {
  it("prefers TEST_DATABASE_URL", () => {
    const url = "postgresql://u:p@db:5432/other_test";
    expect(testDatabaseUrl({ TEST_DATABASE_URL: url, DATABASE_URL: DEV })).toBe(url);
  });

  it("derives from DATABASE_URL", () => {
    expect(testDatabaseUrl({ DATABASE_URL: DEV })).toMatch(/\/globalmentor360_test\?/);
  });

  it("refuses a TEST_DATABASE_URL that is not a test database", () => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: DEV })).toThrow(/_test/);
  });

  it("explains itself when nothing is set", () => {
    expect(() => testDatabaseUrl({})).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/test-database.test.ts`
Expected: FAIL, cannot resolve `./test-database`.

- [ ] **Step 3: Implement**

`lib/test-database.ts`:

```ts
/**
 * The integration suite, e2e and the volume fixture write real rows. They used
 * to share DATABASE_URL with `next dev`, which is how "vol- Catalog 49" and ten
 * copies of a Q&A question ended up on the home page. They now run against a
 * database whose name ends in `_test`, and refuse anything else.
 */
const SUFFIX = "_test";

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

export function deriveTestDatabaseUrl(value: string): string {
  const url = new URL(value);
  const name = databaseName(url);
  if (!name.endsWith(SUFFIX)) url.pathname = `/${name}${SUFFIX}`;
  return url.toString();
}

export function assertTestDatabaseUrl(value: string): void {
  const name = databaseName(new URL(value));
  if (!name.endsWith(SUFFIX)) {
    throw new Error(
      `Refusing to run against database "${name}". Test runs need a database whose name ends in ` +
        `"${SUFFIX}" so they never write fixtures into the dev database. Run \`npm run db:test:prepare\`.`,
    );
  }
}

export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.TEST_DATABASE_URL;
  const base = env.DATABASE_URL;
  if (!explicit && !base) {
    throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) — copy .env.example to .env.");
  }
  const url = explicit ?? deriveTestDatabaseUrl(base!);
  assertTestDatabaseUrl(url);
  return url;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/test-database.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Side-effect module and prepare script**

`scripts/use-test-db.ts`:

```ts
/**
 * Import immediately after "dotenv/config" and before anything that imports
 * lib/db — ES modules evaluate in import order, and lib/db reads DATABASE_URL
 * when it is first evaluated.
 */
import { testDatabaseUrl } from "../lib/test-database";

process.env.DATABASE_URL = testDatabaseUrl();
```

`scripts/test-db-prepare.ts`:

```ts
/**
 * Creates globalmentor360_test if missing, applies migrations, seeds it.
 * Safe to re-run. Never touches the dev database.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";
import { testDatabaseUrl } from "../lib/test-database";

const target = new URL(testDatabaseUrl());
const name = decodeURIComponent(target.pathname.slice(1));
const admin = new URL(target.toString());
admin.pathname = "/postgres";
admin.search = "";

const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
if (exists.rowCount === 0) {
  // Identifiers cannot be bound parameters; the name was validated to end in _test.
  await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  console.log(`Created ${name}.`);
}
await client.end();

const env = { ...process.env, DATABASE_URL: target.toString() };
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("npx prisma db seed", { stdio: "inherit", env });
console.log(`${name} is migrated and seeded.`);
```

- [ ] **Step 6: Point the integration suite at it**

In `tests/integration/setup.ts`, add this line at the very top of the file, above the doc comment:
`import { testDatabaseUrl } from "../../lib/test-database";`.
Then replace the `if (!process.env.DATABASE_URL) { … }` block with:

```ts
// Never the dev database: testDatabaseUrl() throws unless the name ends in _test.
// `npm run db:test:prepare` creates and migrates it.
process.env.DATABASE_URL = testDatabaseUrl();
```

Rewrite the "Leftover hygiene" comment's first line to say "test DB only". Keep the rest.

- [ ] **Step 7: Scripts**

In `package.json` `scripts`:
- add `"db:test:prepare": "tsx scripts/test-db-prepare.ts"`;
- in `test:db:payments`, `test:db:prices` and `test:db:schema`, change `-d globalmentor360` to `-d globalmentor360_test`.

- [ ] **Step 8: Prepare and run the suites against it**

Run: `npm run db:test:prepare`
Expected: "Created globalmentor360_test.", migrations applied, seed output, "is migrated and seeded."

Then check the dev DB's counts, run the suites, and check the dev counts again. They must not change:

```bash
docker exec globalmentor360-db psql -U postgres -d globalmentor360 -tAc "select count(*) from courses; select count(*) from users;"
```

Run: `npm run test:db`
Expected: SQL suites print their PASS lines; flows suite 155 passed.

Repeat the psql counts. Expected: identical to before.

- [ ] **Step 9: Commit**

```bash
git add lib/test-database.ts lib/test-database.test.ts scripts/use-test-db.ts scripts/test-db-prepare.ts tests/integration/setup.ts package.json
git commit -m "Run the database suites against globalmentor360_test, never dev"
```

---

### Task 3: e2e and the volume fixture on the test database

**Files:**
- Modify: `playwright.config.ts`, `e2e/qa-learner.spec.ts:11-13`, `scripts/seed-volume.ts:10-11`, `.gitignore`

**Interfaces:**
- Consumes: `testDatabaseUrl()` from Task 2; `scripts/use-test-db.ts`.
- Produces: e2e server at `http://localhost:3100` (`E2E_PORT`), dist dir `.next-e2e`.

- [ ] **Step 1: Playwright starts its own server against the test DB**

Next 16 allows one `next dev` per dist dir (lockfile). `next.config.ts` already reads `NEXT_DIST_DIR`. Replace `playwright.config.ts` with:

```ts
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./lib/test-database";

/**
 * Critical-path smoke tests. They run against their own `next dev` on port 3100
 * with its own dist dir and the _test database, so a run never writes fixtures
 * into the dev database the developer is looking at on :3000.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const DATABASE_URL = testDatabaseUrl();

// Specs that open their own pg connection read this.
process.env.DATABASE_URL = DATABASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL,
      NEXT_DIST_DIR: ".next-e2e",
      BETTER_AUTH_URL: BASE_URL,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      // Console mail fallback; never SES from a test run.
      EMAIL_FROM: "",
    },
  },
});
```

- [ ] **Step 2: The learner spec's fallback URL**

In `e2e/qa-learner.spec.ts`, replace lines 11-13 with:

```ts
// playwright.config.ts sets DATABASE_URL to the _test database before specs load.
const LOCAL_DATABASE_URL = process.env.DATABASE_URL!;
```

Run `grep -rn "globalmentor360?schema\|localhost:3000" e2e` and fix any other hardcoded dev URL or port the same way.

- [ ] **Step 3: The volume fixture refuses dev**

In `scripts/seed-volume.ts`, directly under `import "dotenv/config";` add `import "./use-test-db";`. In the header comment replace "Safe to wipe with" with "Writes to the _test database only (scripts/use-test-db.ts). Wipe with".

- [ ] **Step 4: Ignore the e2e dist dir**

Add `.next-e2e/` under `.next-verify/` in `.gitignore`.

- [ ] **Step 5: Verify**

Run: `npx tsx scripts/seed-volume.ts --clean`
Expected: completes; dev counts (psql from Task 2 Step 8) unchanged.

Run: `npm run test:e2e -- e2e/critical-path.spec.ts`
Expected: a server boots on :3100 and the critical-path specs pass. The dev preview on :3000 keeps running.

Run: `npm run test:e2e`
Expected: all specs pass. If a spec fails because the test DB lacks data it creates itself, investigate with superpowers:systematic-debugging. Don't weaken the assertion. Dev counts must still be unchanged.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e scripts/seed-volume.ts .gitignore
git commit -m "Run e2e and the volume fixture against the test database"
```

---

### Task 4: A believable catalog in the seed

**Files:**
- Create: `prisma/seed-content.ts`, `prisma/seed-content.test.ts`
- Rewrite: `prisma/seed.ts`

**Interfaces:**
- Produces: `SEED_COURSES: SeedCourse[]` and `SEED_LEARNERS: SeedLearner[]` from `prisma/seed-content.ts`.

```ts
export type SeedLesson =
  | { kind: "article"; title: string; minutes: number; preview?: boolean; body: string }
  | { kind: "quiz"; title: string; passPct: number; questions: SeedQuestion[] };
export type SeedQuestion = {
  prompt: string;
  type: "SINGLE_CHOICE" | "TRUE_FALSE";
  explanation?: string;
  options: { text: string; correct: boolean }[];
};
export type SeedCourse = {
  slug: string; title: string; subtitle: string; description: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS";
  categorySlug: string; priceBdtMinor: number; priceUsdCents: number;
  objectives: string[]; requirements: string[]; audience: string[];
  sections: { title: string; lessons: SeedLesson[] }[];
};
export type SeedLearner = {
  name: string; email: string;
  reviews: { courseSlug: string; rating: 1 | 2 | 3 | 4 | 5; body: string }[];
};
```

- [ ] **Step 1: Write the failing content test**

`prisma/seed-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SEED_COURSES, SEED_LEARNERS } from "./seed-content";

const words = (s: string) => s.trim().split(/\s+/).length;

describe("seed content", () => {
  it("keeps the two slugs and prices the e2e suite depends on", () => {
    const ts = SEED_COURSES.find((c) => c.slug === "typescript-foundations");
    const sql = SEED_COURSES.find((c) => c.slug === "sql-for-analysts");
    expect([ts?.priceBdtMinor, ts?.priceUsdCents]).toEqual([599000, 4900]);
    expect([sql?.priceBdtMinor, sql?.priceUsdCents]).toEqual([399000, 3900]);
  });

  it("has six courses with unique slugs", () => {
    expect(SEED_COURSES).toHaveLength(6);
    expect(new Set(SEED_COURSES.map((c) => c.slug)).size).toBe(6);
  });

  it("has real article bodies, not placeholders", () => {
    for (const course of SEED_COURSES) {
      for (const section of course.sections) {
        for (const lesson of section.lessons) {
          if (lesson.kind !== "article") continue;
          expect(lesson.body, `${course.slug} / ${lesson.title}`).not.toMatch(/placeholder|lorem/i);
          expect(words(lesson.body), `${course.slug} / ${lesson.title}`).toBeGreaterThanOrEqual(80);
        }
      }
    }
  });

  it("gives every course objectives, requirements, audience, a preview and a quiz", () => {
    for (const c of SEED_COURSES) {
      expect(c.objectives.length, c.slug).toBeGreaterThanOrEqual(3);
      expect(c.requirements.length, c.slug).toBeGreaterThanOrEqual(1);
      expect(c.audience.length, c.slug).toBeGreaterThanOrEqual(1);
      const lessons = c.sections.flatMap((s) => s.lessons);
      expect(lessons.some((l) => l.kind === "article" && l.preview), c.slug).toBe(true);
      expect(lessons.some((l) => l.kind === "quiz"), c.slug).toBe(true);
    }
  });

  it("marks exactly one correct option on single-choice and true/false questions", () => {
    for (const c of SEED_COURSES)
      for (const s of c.sections)
        for (const l of s.lessons)
          if (l.kind === "quiz")
            for (const q of l.questions)
              expect(q.options.filter((o) => o.correct), q.prompt).toHaveLength(1);
  });

  it("reviews only name seeded courses, one per learner per course, with text", () => {
    const slugs = new Set(SEED_COURSES.map((c) => c.slug));
    for (const learner of SEED_LEARNERS) {
      const seen = new Set<string>();
      for (const r of learner.reviews) {
        expect(slugs.has(r.courseSlug), r.courseSlug).toBe(true);
        expect(seen.has(r.courseSlug)).toBe(false);
        seen.add(r.courseSlug);
        expect(words(r.body)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("never looks like a fixture", () => {
    const text = JSON.stringify({ SEED_COURSES, SEED_LEARNERS });
    expect(text).not.toMatch(/\bvol-|QA |\b\d{13}\b/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run prisma/seed-content.test.ts`
Expected: FAIL, cannot resolve `./seed-content`. The unit config's include glob `**/*.test.ts` picks up `prisma/`. Confirm it is not excluded.

- [ ] **Step 3: Write the content**

Create `prisma/seed-content.ts` with the types above and this catalog. Write every article body as 2–4 plain paragraphs (80–220 words). Each body teaches the lesson's actual subject, in second person. No marketing voice, no emoji.

| slug | title | level | category | BDT minor / USD cents | sections → lessons (article minutes; ★ = free preview; Q = quiz) |
|---|---|---|---|---|---|
| `typescript-foundations` | TypeScript Foundations | BEGINNER | `web-development` | 599000 / 4900 | Getting started: Why TypeScript ★ 3, Setting up the compiler 7, Q "Check: setup" · The type system: Structural typing 10, Unions and narrowing 9, Generics without the fear 12, Q "Check: the type system" · Working in a real project: Strict mode settings that matter 8, Typing API responses 11 |
| `sql-for-analysts` | SQL for Analysts | BEGINNER | `data-science` | 399000 / 3900 | Getting started: Why SQL still matters ★ 4, SELECT, FROM, WHERE 8, Q "Check: first queries" · Joining and summarising: Joins without duplicate rows 12, GROUP BY and HAVING 10, Q "Check: joins" |
| `postgres-for-app-developers` | Postgres for Application Developers | INTERMEDIATE | `web-development` | 699000 / 5900 | Schema design: Choosing keys ★ 9, Constraints as documentation 8, Q · Performance: Reading EXPLAIN 14, Indexes you actually need 11, Q |
| `excel-for-business-reporting` | Excel for Business Reporting | BEGINNER | `management` | 299000 / 2900 | Clean data: Tables, not ranges ★ 6, Fixing dates and text 9, Q · Reports: PivotTables 12, Charts a manager reads in ten seconds 8, Q |
| `spoken-english-for-interviews` | Spoken English for Job Interviews | ALL_LEVELS | `entrepreneurship` | 199000 / 1900 | Before the interview: Telling your story in two minutes ★ 7, Answering "tell me about yourself" 8, Q · In the room: Handling questions you did not expect 9, Asking good questions at the end 6, Q |
| `python-basics` | Python Basics | BEGINNER | `data-science` | 449000 / 3900 | First steps: Installing Python and running a script ★ 6, Variables and types 8, Q · Doing real work: Lists and loops 10, Reading a CSV file 11, Q |

Each quiz has 3 questions (a mix of SINGLE_CHOICE and TRUE_FALSE), each with an `explanation`, and `passPct` 70. Each course has 3–5 objectives, 1–3 requirements and 1–3 audience lines, all specific to the course. The existing `typescript-foundations` quiz questions ("TypeScript's type system is primarily…", "`strict` in tsconfig enables noImplicitAny.") move into "Check: the type system".

`SEED_LEARNERS`: six learners with plausible Bangladeshi names and `@example.com` emails (e.g. `nusrat.jahan@example.com`, `tanvir.ahmed@example.com`, `farhana.akter@example.com`, `rakib.hasan@example.com`, `sadia.islam@example.com`, `imran.hossain@example.com`). Together they write 12 reviews spread over all six courses: ratings mostly 4–5, one 3 with specific criticism. Each review is 1–3 sentences about something concrete in the course.

- [ ] **Step 4: Content test passes**

Run: `npx vitest run prisma/seed-content.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Rewrite `prisma/seed.ts` to be data-driven**

Keep `seedTaxonomy`, `ensureUser`, `setPrice`, `seedCoupon` and the header comment as they are. Add this at the top, under `import "dotenv/config";`:

```ts
// Seeding never sends mail: sign-ups and announcements use the console fallback.
process.env.EMAIL_FROM = "";
```

Replace `seedCourse` and `seedSecondCourse` with one function:

```ts
async function seedCourse(spec: SeedCourse, instructorId: string) {
  const category = await db.category.findUniqueOrThrow({ where: { slug: spec.categorySlug } });
  const data = {
    title: spec.title,
    subtitle: spec.subtitle,
    description: spec.description,
    level: spec.level,
    language: "en",
    status: "PUBLISHED" as const,
    primaryCategoryId: category.id,
    instructorId,
  };
  const course = await db.course.upsert({
    where: { slug: spec.slug },
    update: data,
    create: { ...data, slug: spec.slug, publishedAt: new Date() },
  });

  // Rebuild the curriculum only when its shape changed, so re-seeding does not
  // wipe learners' progress (item_progress cascades from curriculum_items).
  const existing = await db.curriculumItem.findMany({
    where: { section: { courseId: course.id } },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
    select: { title: true },
  });
  const wanted = spec.sections.flatMap((s) => s.lessons.map((l) => l.title));
  if (existing.map((e) => e.title).join("\n") !== wanted.join("\n")) {
    await db.section.deleteMany({ where: { courseId: course.id } });
    for (const [sIndex, section] of spec.sections.entries()) {
      const row = await db.section.create({
        data: { courseId: course.id, title: section.title, position: sIndex },
      });
      for (const [lIndex, lesson] of section.lessons.entries()) {
        await db.curriculumItem.create({ data: curriculumItemData(row.id, lIndex, lesson) });
      }
    }
  }

  await replaceList("courseObjective", course.id, spec.objectives);
  await replaceList("courseRequirement", course.id, spec.requirements);
  await replaceList("courseTargetAudience", course.id, spec.audience);
  await setPrice(course.id, "USD", spec.priceUsdCents);
  await setPrice(course.id, "BDT", spec.priceBdtMinor);
  return course;
}

function curriculumItemData(sectionId: string, position: number, lesson: SeedLesson) {
  if (lesson.kind === "article") {
    return {
      sectionId,
      position,
      type: "LECTURE" as const,
      title: lesson.title,
      isPreview: Boolean(lesson.preview),
      lecture: {
        create: {
          contentType: "ARTICLE" as const,
          articleBody: lesson.body,
          durationSeconds: lesson.minutes * 60,
        },
      },
    };
  }
  return {
    sectionId,
    position,
    type: "QUIZ" as const,
    title: lesson.title,
    assessment: {
      create: {
        type: "QUIZ" as const,
        passThresholdPct: lesson.passPct,
        questions: {
          create: lesson.questions.map((q, qIndex) => ({
            prompt: q.prompt,
            type: q.type,
            position: qIndex,
            explanation: q.explanation,
            options: {
              create: q.options.map((o, oIndex) => ({
                text: o.text,
                isCorrect: o.correct,
                position: oIndex,
              })),
            },
          })),
        },
      },
    },
  };
}

async function replaceList(
  model: "courseObjective" | "courseRequirement" | "courseTargetAudience",
  courseId: string,
  items: string[],
) {
  const delegate = db[model] as unknown as {
    deleteMany: (a: { where: { courseId: string } }) => Promise<unknown>;
    createMany: (a: { data: { courseId: string; text: string; position: number }[] }) => Promise<unknown>;
  };
  await delegate.deleteMany({ where: { courseId } });
  await delegate.createMany({ data: items.map((text, position) => ({ courseId, text, position })) });
}
```

Add the learner journey and reviews:

```ts
async function completeCourse(userId: string, courseId: string) {
  const items = await db.curriculumItem.findMany({
    where: { section: { courseId } },
    select: { id: true, type: true, assessment: { select: { id: true, questions: { select: { id: true, options: { select: { id: true, isCorrect: true } } } } } } },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
  });
  for (const item of items) {
    if (item.type === "LECTURE") await markLectureComplete(userId, item.id);
    if (item.type === "QUIZ" && item.assessment) {
      await submitQuizAttempt(
        userId,
        item.assessment.id,
        item.assessment.questions.map((q) => ({
          questionId: q.id,
          selectedOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
        })),
      );
    }
  }
  await recomputeCourseProgress(userId, courseId);
}

async function completeFirstLessons(userId: string, courseId: string, count: number) {
  const lectures = await db.curriculumItem.findMany({
    where: { section: { courseId }, type: "LECTURE" },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
    take: count,
    select: { id: true },
  });
  for (const lecture of lectures) await markLectureComplete(userId, lecture.id);
  await recomputeCourseProgress(userId, courseId);
}
```

`QuizSubmission` is `{ questionId: string; selectedOptionIds: string[] }` (`lib/progress.ts:1027`). Completing items in curriculum order satisfies the sequential unlock and the quiz gates. `recomputeCourseProgress` already calls `issueCertificateIfComplete` (`lib/progress.ts:874`), so the certificate appears without an extra call.

`main()`:
1. Seed the taxonomy.
2. Create the three seed users as today.
3. Seed every course with `seedCourse(spec, instructor.id)`.
4. Seed the coupon.
5. For the learner: `grantEnrollment(learner.id, sql.id, "GRANT")` then `completeCourse`. The certificate is issued by the progress path when percent hits 100.
6. Then `grantEnrollment(learner.id, ts.id, "GRANT")` and `completeFirstLessons(learner.id, ts.id, 3)`. Both calls are idempotent: check `db.enrollment.findUnique` first if `grantEnrollment` throws on a duplicate.
7. For each `SEED_LEARNERS` entry: `ensureUser({ …, roles: ["LEARNER"] })`, then for each review `grantEnrollment(user.id, course.id, "GRANT")` (skip if enrolled) and `saveReview({ userId, courseId, rating, body })`. `saveReview` recomputes the rating itself. If it doesn't, call `recomputeCourseRating(courseId)`.
8. Send one announcement on `typescript-foundations` via `sendAnnouncement({ instructorId, courseId, subject: "Office hours this Thursday", body: "…" })`, only if none with that subject exists.
9. Print the summary line and the sign-in hint.

Import `SEED_COURSES`, `SEED_LEARNERS`, `SeedCourse` and `SeedLesson` from `./seed-content`. Import `markLectureComplete`, `submitQuizAttempt` and `recomputeCourseProgress` from `../lib/progress`, `saveReview` from `../lib/reviews`, and `sendAnnouncement` from `../lib/announcements`.

- [ ] **Step 6: Seed the test DB twice (idempotence)**

Run: `npm run db:test:prepare && npm run db:test:prepare`
Expected: both runs succeed. Then check:
`docker exec globalmentor360-db psql -U postgres -d globalmentor360_test -tAc "select count(*) from courses where status='PUBLISHED'; select count(*) from reviews; select count(*) from certificates;"`
Expected: 6 courses (plus any the integration suite left behind, which are gone after a fresh `migrate reset` of the test DB), 12 reviews, at least 1 certificate. The counts are the same after the second run.

- [ ] **Step 7: Suites still green on the new seed**

Run: `npm run test && npm run test:db && npm run test:e2e`
Expected: all green. e2e depends on `typescript-foundations` / `sql-for-analysts`. If a spec assumed the learner is *not* enrolled in `sql-for-analysts` (checkout/cart flows), move the learner's completed course to `python-basics` instead of `sql-for-analysts` and rerun. Check `grep -n "sql-for-analysts" e2e/*.ts` first.

- [ ] **Step 8: Commit**

```bash
git add prisma/seed.ts prisma/seed-content.ts prisma/seed-content.test.ts
git commit -m "Seed a small believable catalog with real lessons and reviews"
```

---

### Task 5: Clean the dev database (needs the user's consent)

**Files:** none changed if the reset path is taken. Otherwise create `scripts/clean-dev-fixtures.ts`.

- [ ] **Step 1: Ask the user**

Send exactly one short question:

> The dev database has ~55 fixture courses and ~66 test users from old test runs. Can I reset it (`prisma migrate reset`, which deletes all dev data) and reseed it with the new catalog? Nothing outside your local Docker database is touched. If you'd rather keep your data, I'll delete only rows that match fixture patterns instead.

Do not continue until they answer.

- [ ] **Step 2a: If they consent to the reset**

Put their consent message in the variable:

```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<their words>" npx prisma migrate reset --force
```

Expected: all migrations re-applied and the seed runs (`migrations.seed` in `prisma.config.ts`). Verify that `courses.search_vector` exists:
`docker exec globalmentor360-db psql -U postgres -d globalmentor360 -tAc "select count(*) from information_schema.columns where table_name='courses' and column_name='search_vector'"` → `1`.

- [ ] **Step 2b: If they decline, a scoped cleanup**

Create `scripts/clean-dev-fixtures.ts`. It supports `--dry-run` (the default: print counts only) and `--apply` (one transaction).

It deletes, in FK-safe order:
- users whose email starts with `vol-`, or matches `%@example.com` but is not one of the three seed accounts and not in `SEED_LEARNERS`. Cascade handles their notes, progress, reviews and threads.
- courses whose slug starts with `vol-`, `qa-` or `rollup-course-`, or whose title starts with `QA `. Before deleting them, delete their orders' items, payments, coupons and prices. Read the FK `onDelete` rules in `schema.prisma`: `Review.course` is `Restrict`.
- announcements titled `QA %`.
- notes and threads whose body matches `\d{13}`.
- coupons other than `SAVE10` whose code starts with `APPR`, `CAP`, `CART`, `GRD`, `INV` or `QAINS`.
- orphan `analytics_events`.

Run with `--dry-run`, show the user the counts, then `--apply` after they OK it. Then run `npm run db:seed`.

- [ ] **Step 3: Verify**

In the dev preview (`preview_start` name `globalmentor360-dev`):
- `/courses` lists exactly the 6 seed courses.
- Home testimonials show seed learner names.
- `/learn/typescript-foundations/<first item>` as the learner shows no "QA" notes or duplicate questions.

- [ ] **Step 4: Commit (only for path 2b)**

```bash
git add scripts/clean-dev-fixtures.ts
git commit -m "Add a scoped cleanup for fixture rows in the dev database"
```

---

### Task 6: The audit harness lives in the repo

**Files:**
- Create: `scripts/ui-audit/audit.mjs`, `scripts/ui-audit/keyboard.mjs`, `scripts/ui-audit/summarise.mjs`, `scripts/ui-audit/ids.mjs`, `scripts/ui-audit/README.md`
- Modify: `package.json` (devDependency `axe-core`, scripts `ui-audit`, `ui-audit:keyboard`, `ui-audit:summary`)

**Interfaces:**
- Produces: `npm run ui-audit` writes `design-review/ui-audit/results.json` and `design-review/ui-audit/shots/{role}-{name}-{desk|phone}.png` (the folder is gitignored). `npm run ui-audit:summary` prints totals per check. Env `BASE` (default `http://localhost:3000`) and `ONLY` (comma-separated route names).

- [ ] **Step 1: Install axe-core**

Run: `npm install -D axe-core@^4.13.0`

- [ ] **Step 2: Look up IDs instead of hardcoding UUIDs**

`scripts/ui-audit/ids.mjs`:

```js
// Route IDs change on every reseed, so the audit looks them up.
import "dotenv/config";
import pg from "pg";

export async function lookupIds() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const one = async (sql, params = []) => (await client.query(sql, params)).rows[0] ?? {};
  try {
    const course = await one(`select id from courses where slug = 'typescript-foundations'`);
    const article = await one(
      `select ci.id from curriculum_items ci join sections s on s.id = ci."sectionId"
        where s."courseId" = $1 and ci.type = 'LECTURE' order by s.position, ci.position limit 1`,
      [course.id],
    );
    const quiz = await one(
      `select ci.id from curriculum_items ci join sections s on s.id = ci."sectionId"
        where s."courseId" = $1 and ci.type = 'QUIZ' order by s.position, ci.position limit 1`,
      [course.id],
    );
    const learner = await one(`select id from users where email = 'learner@example.com'`);
    const order = await one(`select id from orders where "userId" = $1 order by "createdAt" desc limit 1`, [learner.id]);
    const cert = await one(`select serial from certificates where "userId" = $1 limit 1`, [learner.id]);
    return {
      course: "typescript-foundations",
      buyCourse: "postgres-for-app-developers",
      courseId: course.id,
      article: article.id,
      quiz: quiz.id,
      order: order.id ?? null,
      cert: cert.serial ?? null,
    };
  } finally {
    await client.end();
  }
}
```

Before writing this file, check the real column names with
`docker exec globalmentor360-db psql -U postgres -d globalmentor360 -c "\d curriculum_items" -c "\d orders"`.
Prisma maps camelCase fields to quoted camelCase columns unless `@map` says otherwise. Fix the SQL to match. `buyCourse` must be a course the learner is not enrolled in.

- [ ] **Step 3: Move the harness**

Copy `audit.mjs` and `keyboard.mjs` from the session scratchpad (`C:\Users\tazvi\AppData\Local\Temp\claude\D--Github-GlobalMentor360v2\30ed2217-9ef9-413e-ae3d-9caf52e91f9f\scratchpad\audit\`) into `scripts/ui-audit/`, with these changes:
- Load axe with `createRequire(import.meta.url).resolve("axe-core/axe.min.js")`, not the scratchpad's node_modules.
- `OUT = path.resolve("design-review/ui-audit")`.
- Replace the `IDS` constant with `const IDS = await lookupIds();`. Build routes from it and skip routes whose ID is null, logging a line such as `skip order: learner has no orders`.
- Studio routes use `IDS.courseId` and `/studio/courses/${IDS.courseId}/curriculum/${IDS.article}`.
- Add `ONLY` filtering: `const only = process.env.ONLY?.split(",")`, and skip names not in it.
- Tiny-text threshold: 13px (spec minimum), not 12px.
- `keyboard.mjs` builds its page list from the same `lookupIds()`.

Port `summarise.cjs` to ESM as `summarise.mjs`, reading `design-review/ui-audit/results.json`. It prints, per check (axe rule, overflow, small targets, tiny text, h1 ≠ 1, missing main, console errors, non-200), the count and the worst three pages.

`README.md` (short): what each script checks (WCAG SC numbers), how to run, that it needs the dev server on :3000 and the seed accounts, and where output goes.

- [ ] **Step 4: Scripts**

```json
    "ui-audit": "node scripts/ui-audit/audit.mjs",
    "ui-audit:keyboard": "node scripts/ui-audit/keyboard.mjs",
    "ui-audit:summary": "node scripts/ui-audit/summarise.mjs",
```

- [ ] **Step 5: Run it (baseline on the clean data)**

With the dev server running: `npm run ui-audit && npm run ui-audit:summary`
Expected: 29 routes × 2 viewports visited, none erroring. The summary shows the two known axe rules (`label` on studio-course, `color-contrast` on dashboard) and the tiny-text counts. Save the summary output into the progress log of the spec as "baseline after data cleanup".

- [ ] **Step 6: Commit**

```bash
git add scripts/ui-audit package.json package-lock.json
git commit -m "Add the UI audit harness (axe WCAG 2.2 AA, targets, text size, overflow)"
```

---

## Phase 1: tokens and type

### Task 7: Design tokens as code, with contrast proofs

**Files:**
- Create: `lib/design-tokens.ts`, `lib/design-tokens.test.ts`

**Interfaces:**
- Produces: `PALETTE` (a `Record<TokenName, \`#${string}\`>` for `paper surface ink graphite rule control wash mark verified seal caution cautionWash`), `contrastRatio(a: string, b: string): number`, `REQUIRED_PAIRS: { fg: TokenName | "white"; bg: TokenName | "white"; min: number; use: string }[]`.

- [ ] **Step 1: Write the failing test**

`lib/design-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE, REQUIRED_PAIRS, contrastRatio } from "./design-tokens";

const hex = (name: string) => (name === "white" ? "#ffffff" : PALETTE[name as keyof typeof PALETTE]);

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});

describe("palette pairs", () => {
  for (const pair of REQUIRED_PAIRS) {
    it(`${pair.fg} on ${pair.bg} ≥ ${pair.min}:1 (${pair.use})`, () => {
      expect(contrastRatio(hex(pair.fg), hex(pair.bg))).toBeGreaterThanOrEqual(pair.min);
    });
  }
});

describe("globals.css", () => {
  const css = readFileSync(path.resolve("app/globals.css"), "utf8").toLowerCase();

  it("declares every palette value", () => {
    for (const [name, value] of Object.entries(PALETTE)) {
      expect(css, name).toContain(value.toLowerCase());
    }
  });

  it("has no trace of the old teal/amber system", () => {
    for (const old of ["#0e4f56", "#c2410c", "#f7fafa", "fraunces", "source-sans", "noto-bengali"]) {
      expect(css).not.toContain(old);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/design-tokens.test.ts`
Expected: FAIL, cannot resolve `./design-tokens`.

- [ ] **Step 3: Implement**

`lib/design-tokens.ts`:

```ts
/**
 * The palette from docs/superpowers/specs/2026-09-25-ui-ux-overhaul-design.md §4.
 * globals.css is the runtime source; this module exists so the contrast of every
 * pairing the UI uses is proven by a test, and so globals.css cannot drift.
 */
export const PALETTE = {
  paper: "#fcfcfd",
  surface: "#ffffff",
  ink: "#1d2242",
  graphite: "#5e6376",
  rule: "#e3e5ec",
  control: "#8a8fa3",
  wash: "#f3f4f7",
  mark: "#f6e35a",
  verified: "#0b5d46",
  seal: "#d2303f",
  caution: "#8a5a00",
  cautionWash: "#fbf1d6",
} as const satisfies Record<string, `#${string}`>;

export type TokenName = keyof typeof PALETTE;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Side = TokenName | "white";

export const REQUIRED_PAIRS: { fg: Side; bg: Side; min: number; use: string }[] = [
  { fg: "ink", bg: "paper", min: 4.5, use: "body text" },
  { fg: "graphite", bg: "paper", min: 4.5, use: "secondary text" },
  { fg: "graphite", bg: "wash", min: 4.5, use: "inactive tab, table header" },
  { fg: "white", bg: "ink", min: 4.5, use: "primary button" },
  { fg: "white", bg: "verified", min: 4.5, use: "paid/verified badge" },
  { fg: "verified", bg: "white", min: 4.5, use: "verified text" },
  { fg: "white", bg: "seal", min: 4.5, use: "destructive button" },
  { fg: "seal", bg: "white", min: 4.5, use: "error text" },
  { fg: "caution", bg: "cautionWash", min: 4.5, use: "pending notice" },
  { fg: "ink", bg: "mark", min: 4.5, use: "current lesson highlight" },
  { fg: "control", bg: "surface", min: 3, use: "input borders (1.4.11)" },
  { fg: "ink", bg: "surface", min: 3, use: "focus outline (1.4.11)" },
];
```

- [ ] **Step 4: Run the contrast tests (the CSS tests still fail)**

Run: `npx vitest run lib/design-tokens.test.ts -t "palette pairs|contrastRatio"`
Expected: PASS. The `globals.css` describe block fails until Task 8, which is expected.

- [ ] **Step 5: Commit**

```bash
git add lib/design-tokens.ts lib/design-tokens.test.ts
git commit -m "Add the palette as code with WCAG contrast proofs"
```

---

### Task 8: Tokens, type scale and fonts

**Files:**
- Rewrite: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `PALETTE` values (Task 7).
- Produces: CSS custom properties `--paper --surface --ink --graphite --rule --control --wash --mark --verified --seal --caution --caution-wash`, the Tailwind colours `paper surface ink graphite rule control wash mark verified seal caution caution-wash` (in addition to the shadcn names), `font-sans` / `font-heading` (Schibsted Grotesk), `font-mono` (IBM Plex Mono), utilities `focus-ring` and `shadow-certificate`. Later plans use these names.

- [ ] **Step 1: Fonts**

In `app/layout.tsx` replace the three font imports and objects with:

```tsx
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";

// One family for everything; weights come from the variable axis (400–900).
const schibsted = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-schibsted",
  display: "swap",
});

// Only for strings people read or type exactly: serials, transaction IDs, codes.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
});
```

Set `className={\`min-w-0 overflow-x-clip ${schibsted.variable} ${plexMono.variable}\`}` on `<html>`. Change `metadata.title.default` to `"GlobalMentor360"` and the description to `"Structured online courses. Each section ends with a quiz, and every certificate has a serial anyone can verify."` (no slogan).

- [ ] **Step 2: Rewrite `app/globals.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";

/*
 * GlobalMentor360 tokens. Source of truth:
 * docs/superpowers/specs/2026-09-25-ui-ux-overhaul-design.md §4.
 * lib/design-tokens.test.ts proves the contrast of every pairing and fails if
 * a palette value here drifts.
 *
 * Every colour means one thing:
 *   ink       text, primary actions
 *   mark      "you are here" only (current lesson/step) — never a button
 *   verified  completed, paid, verified, certificate
 *   seal      certificate seal, destructive, errors
 *   caution   pending (awaiting bKash verification, needs action)
 */
:root {
  --paper: #fcfcfd;
  --surface: #ffffff;
  --ink: #1d2242;
  --graphite: #5e6376;
  --rule: #e3e5ec;
  --control: #8a8fa3;
  --wash: #f3f4f7;
  --mark: #f6e35a;
  --verified: #0b5d46;
  --seal: #d2303f;
  --caution: #8a5a00;
  --caution-wash: #fbf1d6;

  /* shadcn contract, mapped onto the palette. */
  --background: var(--paper);
  --foreground: var(--ink);
  --card: var(--surface);
  --card-foreground: var(--ink);
  --popover: var(--surface);
  --popover-foreground: var(--ink);
  --primary: var(--ink);
  --primary-foreground: #ffffff;
  --primary-hover: #2b3160;
  --primary-active: #141830;
  --secondary: var(--surface);
  --secondary-foreground: var(--ink);
  --muted: var(--wash);
  --muted-foreground: var(--graphite);
  /* No second CTA colour: accent is ink. */
  --accent: var(--ink);
  --accent-foreground: #ffffff;
  --accent-hover: #2b3160;
  --accent-active: #141830;
  --destructive: var(--seal);
  --destructive-foreground: #ffffff;
  --border: var(--rule);
  --input: var(--control);
  --ring: var(--ink);
  --success: var(--verified);
  --success-foreground: #ffffff;
  --warning: var(--caution);
  --warning-foreground: #ffffff;
  --star: var(--ink);
  --radius: 0.375rem;

  --chart-1: var(--ink);
  --chart-2: var(--verified);
  --chart-3: var(--graphite);
  --chart-4: var(--caution);
  --chart-5: var(--seal);
}

@theme inline {
  --color-paper: var(--paper);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-graphite: var(--graphite);
  --color-rule: var(--rule);
  --color-control: var(--control);
  --color-wash: var(--wash);
  --color-mark: var(--mark);
  --color-verified: var(--verified);
  --color-seal: var(--seal);
  --color-caution: var(--caution);
  --color-caution-wash: var(--caution-wash);

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-hover: var(--primary-hover);
  --color-primary-active: var(--primary-active);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent-hover: var(--accent-hover);
  --color-accent-active: var(--accent-active);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-star: var(--star);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  --font-sans: var(--font-schibsted), ui-sans-serif, system-ui, sans-serif;
  --font-heading: var(--font-schibsted), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, "Cascadia Mono", Consolas, monospace;

  /* Type scale. Minimum 13px: text-xs is 13px, not Tailwind's 12px. */
  --text-xs: 0.8125rem;
  --text-xs--line-height: 1.45;
  --text-sm: 0.9375rem;
  --text-sm--line-height: 1.5;
  --text-base: 1rem;
  --text-base--line-height: 1.6;
  --text-lg: 1.125rem;
  --text-lg--line-height: 1.55;
  --text-xl: 1.25rem;
  --text-xl--line-height: 1.35;
  --text-2xl: 1.5rem;
  --text-2xl--line-height: 1.25;
  --text-3xl: 2rem;
  --text-3xl--line-height: 1.12;
  --text-4xl: 2.75rem;
  --text-4xl--line-height: 1.04;
  --text-5xl: 3.5rem;
  --text-5xl--line-height: 1.02;

  /* Radius hierarchy: badge 4, control 6, panel 10. The certificate uses rounded-[2px]. */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.625rem;
  --radius-xl: 0.625rem;
  --radius-2xl: 0.625rem;

  /* Panels are drawn with borders, not soft shadows. Only popovers lift. */
  --shadow-xs: 0 0 #0000;
  --shadow-sm: 0 0 #0000;
  --shadow: 0 0 #0000;
  --shadow-md: 0 8px 24px rgb(29 34 66 / 0.12);
  --shadow-lg: 0 8px 24px rgb(29 34 66 / 0.12);
  --shadow-xl: 0 8px 24px rgb(29 34 66 / 0.12);
}

@layer base {
  html {
    /* Sticky bars must never cover the focused element (WCAG 2.4.11). */
    scroll-padding-top: 5rem;
  }
  * {
    border-color: var(--color-border);
  }
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  h1,
  h2,
  h3,
  h4 {
    font-family: var(--font-heading);
    font-weight: 650;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }
  h1 {
    letter-spacing: -0.025em;
  }
  p {
    text-wrap: pretty;
  }
  /* Browser-default focus for anything a component forgot. */
  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
}

/* The one focus style. Components use `focus-ring` instead of ring-[3px]. */
@utility focus-ring {
  outline-style: none;
  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
}

/* Only the certificate gets a hard offset shadow. */
@utility shadow-certificate {
  box-shadow: 10px 10px 0 var(--verified);
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

The deleted `.dark` block, `@custom-variant dark`, the `brand*` aliases, `surface-alt`, `bg-hero-gradient`, `text-gradient-brand` and `shadow-brand` leave dangling classes. Step 3 fixes them.

- [ ] **Step 3: Fix call sites of removed names**

Run: `grep -rn "brand-ink\|bg-brand\|text-brand\|border-brand\|surface-alt\|shadow-brand\|bg-hero-gradient\|text-gradient-brand\|font-\[family-name" app components --include=*.tsx`
Replace each hit: `brand-ink` → `ink`; `bg-brand` / `text-brand` → `ink` / `primary`; `surface-alt` → `wash`; `shadow-brand` → remove.
Run: `grep -rn "dark:" app components --include=*.tsx`. The `dark:` variant no longer exists (Tailwind v4 falls back to the media query), so delete every `dark:…` class.

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/design-tokens.test.ts`
Expected: PASS, including the `globals.css` block.
Run: `npm run typecheck && npm run build`
Expected: green. The build output lists the same routes as before (36).
In the dev preview, check `/`, `/courses` and `/sign-in`: the text is Schibsted Grotesk. Confirm with `getComputedStyle(document.body).fontFamily` via `javascript_tool`: it contains `Schibsted`. There is no teal anywhere, and the primary buttons are ink.
Check the `৳` sign: on the checkout page, zoom a screenshot on the price. If `৳` renders visibly mismatched (baseline or weight), note it in the progress log for plan 3 (the `price` component). Do not change the price format in this task.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx app components
git commit -m "Switch to the ink/verified/seal palette, Schibsted Grotesk and a 13px floor"
```

---

### Task 9: Base components on the new tokens

**Files:**
- Modify: `components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `tabs.tsx`, `accordion.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `progress.tsx`, `table.tsx`
- Modify: every non-ui file listed by `grep -rln "ring-ring/50\|ring-\[3px\]" app components`
- Modify: the 7 files using `variant="cta"`

**Interfaces:**
- Produces: button variants `default` (ink), `secondary` (surface + control border), `outline` (same as secondary; kept for existing call sites), `ghost`, `destructive` (seal), `link`. Sizes `xs` (24), `sm` (32), `default` (40), `lg` (44), `icon` (40), `icon-sm` (32), `icon-xs` (24), `icon-lg` (44). Badge variants `default` (wash/ink), `outline`, `success` (verified), `warning` (caution), `destructive` (seal), `current` (mark/ink). `cta` is removed.

- [ ] **Step 1: Button**

Replace the `buttonVariants` base string's focus part `outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` with `focus-ring`, and the whole `variant` and `size` maps with:

```ts
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        secondary: "border border-input bg-surface text-ink hover:bg-wash",
        outline: "border border-input bg-surface text-ink hover:bg-wash",
        ghost: "text-ink hover:bg-wash",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "h-auto px-0 text-ink underline underline-offset-4 decoration-control hover:decoration-ink",
      },
      size: {
        default: "h-10 px-4 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 px-5 text-base has-[>svg]:px-4",
        icon: "size-10",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
```

Also remove `dark:aria-invalid:ring-destructive/40` from the base. Change `font-medium` to `font-semibold`.

- [ ] **Step 2: Remove `cta`**

Run: `grep -rln 'variant="cta"' app components`. In each file replace `variant="cta"` with nothing, so the default variant (ink) applies. The primary action is ink everywhere.

- [ ] **Step 3: Badge**

Base string: replace `rounded-full` with `rounded-sm` and the focus classes with `focus-ring`. Variants:

```ts
        default: "bg-wash text-ink",
        secondary: "bg-wash text-ink",
        outline: "border-rule text-ink",
        success: "bg-verified text-white",
        warning: "bg-caution-wash text-caution",
        destructive: "bg-seal text-white",
        current: "bg-mark text-ink",
        ghost: "text-graphite",
        link: "text-ink underline underline-offset-4",
```

- [ ] **Step 4: Form controls, tabs, accordion, select**

In `input.tsx`, `textarea.tsx`, `select.tsx` (trigger), `tabs.tsx` (trigger) and `accordion.tsx` (trigger), replace every `outline-none` + `focus-visible:ring-[3px] focus-visible:ring-ring/50` + `focus-visible:border-ring` combination with `focus-ring`.

- Inputs: `h-10`, `border-input` (control), `bg-surface`, `text-base md:text-sm`, placeholder `text-graphite`. Invalid state: `aria-invalid:border-seal`. Remove `shadow-xs`.
- Tabs: read the trigger's classes. The inactive trigger must be `text-graphite` and the active one `text-ink` with a visible indicator: `data-[state=active]:bg-surface data-[state=active]:border-rule` for the default variant, or a 2px ink underline for the line variant. The axe `color-contrast` failure on `/dashboard` was this trigger. Re-check it after the change.
- Card: `rounded-lg border border-rule bg-card`, no shadow.
- Dialog / dropdown-menu content: `rounded-lg border border-rule shadow-md`.
- Progress: track `bg-wash`, indicator `bg-ink`. Completed bars are coloured by callers, not here.
- Table: header row `bg-wash text-graphite text-xs font-semibold` (sentence case, no `uppercase`), cells `py-3`, row hover `hover:bg-wash/60`.

- [ ] **Step 5: Page-level focus rings**

Run: `grep -rln "ring-ring/50\|ring-\[3px\]" app components`. Replace the same combination with `focus-ring` in each file listed.

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run typecheck && npm run test && npm run build`
Expected: all green.
Run: `ONLY=dashboard,studio-course,sign-in,catalog npm run ui-audit && npm run ui-audit:summary`
Expected: `color-contrast` gone from dashboard. `label` on studio-course is still there (fixed in plan 6). No new axe rules. Tiny text (< 13px) only where an arbitrary `text-[11px]` remains, and Task 10 removes that.
Take desk and phone screenshots of home, catalog, dashboard and admin payments, and look at them against spec §4. Buttons are ink, badges square-ish, and no card shadows.

- [ ] **Step 7: Commit**

```bash
git add components app
git commit -m "Restyle the base components on the new tokens with one focus style"
```

---

### Task 10: Remove the generated-looking details

**Files:**
- Delete: `components/site/reveal.tsx`
- Modify: `app/page.tsx`, `app/courses/[slug]/page.tsx` (Reveal usages); `components/site/motion-provider.tsx` (comment)
- Modify: the files with `uppercase`: `app/certificates/[serial]/page.tsx:55,77`, `app/courses/[slug]/checkout/page.tsx:207`, `app/courses/[slug]/page.tsx:553`, `app/learn/[slug]/[itemId]/page.tsx:257`, `components/checkout/bkash-proof-form.tsx:54`. Keep `app/studio/coupons/coupon-form.tsx:40`: coupon codes are uppercase data, not a label style.
- Modify: `app/admin/payments/review-form.tsx:53`, `components/site/header-nav.tsx:107`, `components/site/notifications-menu.tsx:24` (arbitrary sub-13px text)
- Replace: `design-system/MASTER.md`

- [ ] **Step 1: Scroll reveals out**

In `app/page.tsx` and `app/courses/[slug]/page.tsx`, replace each `<Reveal …>children</Reveal>` with its children, and remove the import. Delete `components/site/reveal.tsx`. Update the `MotionProvider` doc comment to: "Honours prefers-reduced-motion for every motion component."
Run: `grep -rn "Reveal" app components` → no hits.

- [ ] **Step 2: No all-caps labels**

In each listed file, remove `uppercase` and any `tracking-*` on the same element. Keep the text in sentence case, rewriting it if the source string is capitalised. On the certificate page (line 55), the eyebrow above the heading is deleted outright rather than restyled. Plan 3 rebuilds that page.

- [ ] **Step 3: Nothing below 13px**

- `review-form.tsx:53`: `text-[11px]` → `text-xs`.
- The badge counters in `header-nav.tsx:107` and `notifications-menu.tsx:24`: change `size-4` + arbitrary text to `min-w-5 h-5 px-1 text-xs tabular-nums`. The count also needs a text alternative on its button: the button's `aria-label` must include the count ("Cart, 2 items"). Check it does.

Run: `grep -rn "text-\[1[0-2]px\]\|text-\[0\.[5-7]" app components` → no hits.

- [ ] **Step 4: Retire the old design doc**

Replace `design-system/MASTER.md` with:

```md
# Superseded

The teal/amber, Fraunces + Source Sans system that was here is retired.

The current design system — palette, type, spacing, radius, elevation, motion,
shells, page plans and the WCAG 2.2 AA bar — is
`docs/superpowers/specs/2026-09-25-ui-ux-overhaul-design.md`.
Tokens live in `app/globals.css`; contrast is proven in `lib/design-tokens.test.ts`.
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run typecheck && npm run test && npm run build`. Expected: green.
Run: `npm run ui-audit && npm run ui-audit:summary`. Expected: tiny text 0 on every page; axe shows only `label` on studio-course; no overflow; no console errors.
Record the summary in the spec's progress log.

- [ ] **Step 6: Commit and push**

```bash
git add -A components app design-system docs/superpowers/specs/2026-09-25-ui-ux-overhaul-design.md
git commit -m "Remove scroll reveals, all-caps labels and sub-13px text"
git push
```

---

## After this plan

Write the next plan from the spec §10 when this one is done, one plan per phase, each with the same level of detail:

- **Plan 2, shells:** route groups, the site top bar with one account menu, a state-aware footer, the learn focus shell (rail, sheet, top bar) and the app shell (sidebar) for studio/admin.
- **Plan 3, core components:** course-module, certificate, cover-mark, course-row, price, status-badge, serial, sheet.
- **Plan 4, public pages:** home, catalog, landing, certificate, auth, checkout, cart, not-found.
- **Plan 5, learner pages:** player tabs and notes timestamp, dashboard, account, orders, notifications.
- **Plan 6, studio and admin:** aligned tables, course editor tabs, label fixes.
- **Plan 7, verification:** the spec §11 checklist.
- **Plans 8+:** the spec §12 features.
