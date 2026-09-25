# UI/UX overhaul + remaining features — design spec and working context

**Status:** approved direction, implementation in progress
**Branch:** `claude/ui-ux-overhaul` (pushed to `origin`)
**Owner:** Md Tazvir Rahat (git user). Email for attribution only: vasbdnet@gmail.com
**Written:** 2026-09-25. Update the [progress log](#17-progress-log) as work lands.

> **If you are a future session reading this after context compaction: this file is the source of
> truth for the current work.** Read it top to bottom before touching code. Then read `AGENTS.md`
> (loaded automatically), `docs/PRODUCT-STATUS.md`, and `docs/TECH-SPEC.md` (invariants). Check the
> progress log at the bottom to see what is already done.

---

## 1. What the user asked for (in order)

1. **Exclude three things** — do not work on: **email delivery** (SES sandbox / Resend), **the bKash
   receiving number** (`BKASH_MERCHANT_NUMBER`), **domain/hosting**. The user handles those.
2. **First: fix the whole web UI and UX.** User's words: "It's totally fucked up." Check WCAG
   documentation and other necessary docs, and use the installed skills.
3. **Then: finish the rest of the remaining features** (section 12).
4. Save every necessary detail in an MD file (this one) so context survives compaction.

### Decisions the user made during brainstorming

| Question | Answer |
|---|---|
| What bothers you most? | **Both equally** — the visual style *and* the layout/structure. Start over on both. |
| Which feel? | **Linear / Stripe style** — premium, minimal, crisp type, restrained colour, polished details. |
| First round of mockups (Ink / Stripe mesh / Editorial serif) | **Rejected as "AI slop design."** Do not reuse any of those treatments. |
| Second round (course-first / certificate-first / Bangla-first) | **Directions 1 and 2 combined.** Direction 3 (Bangla-first UI) was not chosen. |
| Start without further review? | Yes — "save everything in an MD file … and then start working." |

---

## 2. Environment and session state (read before running anything)

### Paths

| Thing | Path |
|---|---|
| **This project (work here)** | `D:\Github\GlobalMentor360v2` |
| Older copy of this repo from earlier sessions | `C:\Users\tazvi\Documents\GitHub\GlobalMentor360v2` (stale; do not edit) |
| Old prototype repos (read-only reference) | `C:\Users\tazvi\Documents\GitHub\globalmentor360`, `C:\Users\tazvi\Documents\GitHub\v3` |
| Brainstorm companion mockups | `.superpowers/brainstorm/582-1790276068/content/` (gitignored). Chosen designs: `visual-direction-v3.html` directions 1 and 2 |
| Session scratchpad (audit harness, screenshots) | `C:\Users\tazvi\AppData\Local\Temp\claude\D--Github-GlobalMentor360v2\30ed2217-9ef9-413e-ae3d-9caf52e91f9f\scratchpad\audit\` — **move the harness into `scripts/ui-audit/` (phase 0)** so it outlives the session |

### Git

- Work on **`claude/ui-ux-overhaul`**. `main` was synced with `origin/main` (0/0) at start.
- Checkpoint commit `ada4df3` = the uncommitted Cursor design pass, committed as-is so the overhaul
  can be diffed against it. It had sat uncommitted for 5 weeks (last prior commit 18 Aug 2026).
- Commit per phase, push the branch. **Do not merge to `main` without the user's OK.**
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `design-review/` (17 MB of old screenshots) and `.superpowers/` are gitignored.

### Running services

| Service | How | Notes |
|---|---|---|
| Postgres 16 | Docker container **`globalmentor360-db`**, port 5432, db `globalmentor360`, user/pass `postgres/postgres` | Container has `restart: unless-stopped`. `docker compose up -d` reports a **name conflict** — harmless, the existing container is the DB. Do not remove it. |
| Dev server | `npm run dev` via the Browser pane `preview_start` name **`globalmentor360-dev`** (`.claude/launch.json`), port **3000** | |
| Brainstorm companion | `http://localhost:52040/?key=b02a5080…` | Auto-exits after 4 h idle. Not needed for implementation. |

**Gotcha seen this session:** when the machine sleeps, **Docker Desktop stops**, and every page
returns 500 with Prisma `ECONNREFUSED`. That is environmental, not a regression. Fix: start
`C:\Program Files\Docker\Docker\Docker Desktop.exe`, wait for `docker info`, wait for the container
to report `healthy`.

### Commands

```bash
npm run dev            # port 3000
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm run test           # unit (no DB) — 322 tests at start
npm run test:db        # SQL constraint suites (payments 10, prices 6, schema 8)
npm run test:db:flows  # DB integration suite — 155 tests at start
npm run test:e2e       # Playwright
npm run build          # next build — 36 routes at start
npm run db:migrate     # NEVER db:push (drops courses.search_vector)
npm run db:seed
```

Baseline at start of this work: tsc clean, 322 unit + 155 integration + 24 SQL tests green, build
green. Lint: 17 errors — 15 are `.cursor/skills/**/*.cjs` (Cursor tooling committed before
`.cursor` was gitignored; still tracked, so still linted), 1 real `react-hooks/set-state-in-effect`
in `app/learn/[slug]/video-player.tsx`, 1 `prefer-const` in `app/studio/coupons/actions.ts`.

### Framework rules (from AGENTS.md — binding)

- **Next.js 16.3.0 is not the Next.js in training data.** Read the relevant guide in
  `node_modules/next/dist/docs/` before writing code (`01-app/01-getting-started/13-fonts.md` for
  fonts, etc.). Heed deprecation notices.
- React 19.2, Tailwind v4 (`@theme` in `app/globals.css`), shadcn components on `radix-ui` 1.6,
  lucide-react 1.30, `motion` 13, Prisma 7.9 (driver adapter; `prisma.config.ts`), Better Auth 1.6,
  Vitest 4, TypeScript 6 (pinned — do not upgrade), ESLint 9 (pinned).
- One Next.js App Router app. APIs are `app/api/*` route handlers plus
  `GET /certificates/[serial]/pdf`. No Express. `/admin` and `/studio` live in this app.
- Seed accounts are identified by **email**. Do not rename `User.name` to match screenshots.
- `/admin/payments` is Approve/Reject of pending bKash proofs — not a student/course picker.

### Seed accounts (local only, password `dev-password-12345`)

| Email | Roles |
|---|---|
| `learner@example.com` | learner (enrolled in TypeScript Foundations, has a certificate) |
| `instructor@example.com` | learner + instructor (owns the sample courses) |
| `admin@example.com` | learner + admin |

Seed coupon: `SAVE10`.

### Secrets and credentials

- **Never paste keys, PEMs or webhook secrets into chat, docs, or commits.** `.env` is gitignored.
- App AWS key in `.env` is the scoped IAM user **`globalmentor360-dev`** (correct). The old leaked
  key `AKIAUN4QE4B47R5KBMGY` was **deactivated** in an earlier session.
- CloudFront signing vars are `AWS_CLOUDFRONT_DOMAIN`, `AWS_CLOUDFRONT_KEY_PAIR_ID`,
  `AWS_CLOUDFRONT_PRIVATE_KEY` (all set). `BUNNY_*` are unused leftovers.
- `BKASH_MERCHANT_NUMBER` is empty on purpose — **user excluded it from this work.**
- Supabase in the old prototype: user chose to leave it (project auto-pauses).

---

## 3. Baseline audit (what was wrong, with evidence)

Audit harness visited **29 routes × 2 viewports (1440×900, 375×812) × the role that can see each
route = 58 page loads**, recorded axe-core 4.13 WCAG 2.2 A/AA violations, horizontal overflow,
tap targets < 24px, text < 12px, h1/main presence, console errors, and full-page screenshots. A
separate keyboard pass tabbed 30 stops on 6 key pages and tested reflow at 320px.

### Standards checked against

- **WCAG 2.2** (W3C quick reference, fetched): 87 success criteria, **56 at Level A/AA** (the
  target). New in 2.2 at A/AA and directly relevant: **2.4.11 Focus Not Obscured (Minimum)**,
  **2.5.7 Dragging Movements** (curriculum reorder), **2.5.8 Target Size (Minimum) 24×24**,
  **3.2.6 Consistent Help**, **3.3.7 Redundant Entry** (checkout), **3.3.8 Accessible
  Authentication (Minimum)** (sign-in: allow paste, no cognitive tests).
- **Vercel Web Interface Guidelines** (`vercel-labs/web-interface-guidelines/command.md`).
- Skills: `design:accessibility-review` (WCAG 2.1 AA checklist; cites 44×44 targets — that is AAA /
  best practice; AA minimum is 24×24), `ui-ux-pro-max` (priority order: accessibility → touch →
  performance → style → layout → typography → animation → forms → navigation),
  `web-design-guidelines`, `frontend-design` (anti-slop).

### Machine-checkable accessibility: mostly fine

| Check | Result |
|---|---|
| axe WCAG violations | **2 rules only.** `label` (critical): 18 unlabeled inputs on `/studio/courses/[id]` — the objectives/requirements/audience list inputs. `color-contrast` (serious): inactive tab trigger on `/dashboard`. |
| Horizontal overflow at 375px | none |
| Reflow at 320px (1.4.10) | passes on all 6 tested pages |
| Skip link first in tab order | yes, every page |
| Visible focus indicator | yes on every real stop (only miss was Next's dev overlay) |
| Focus hidden under sticky header (2.4.11) | none |
| h1 per page / `<main>` | exactly one h1 everywhere; `<main>` everywhere |
| Text under 12px | **on 28 of 58 page loads** (up to 21 elements on one page) |
| Tap targets < 24px (real ones) | 20px-tall links inside tables ("View", course titles, "Curriculum", "Studio"), "Forgot password?" 90×16, native checkboxes 16×16. (False positives ignored: the sr-only skip link and Radix's hidden native `<select>`.) |
| Console errors | none (only the intentional 404 test) |

### What actually makes it look broken

1. **Test data in the dev database.** Integration tests, e2e specs, and `scripts/seed-volume.ts`
   all write to the same `DATABASE_URL` as the dev app. Result: **58 "published" courses, mostly
   fixtures** (`vol- Catalog 49`, `Pogash Pro Coder` for BDT 5.00, `rollup-course-714ef218`); home
   testimonials reading "vol-review 45 from vol-user-45@example.com"; the player showing nine
   "Learner QA note 1786979897162" entries and ten copies of "Why does sequential unlock exist
   1787…?"; announcements titled "QA studio ping ywt8k"; studio listing 70 courses. The catalog on a
   phone is **10,546px** tall. Sources: `scripts/seed-volume.ts`, `e2e/qa-studio.spec.ts`,
   `e2e/qa-learner.spec.ts`, `e2e/helpers.ts`, `tests/integration/*`.
2. **The player (`/learn/[slug]/[itemId]`) has the wrong structure.** Lesson, notes, announcements
   and Q&A are all expanded in one column (4,544px desktop, **6,132px phone**). Marketing header and
   footer stay on screen while learning. **On a phone the curriculum/progress rail is at the very
   bottom, under all the Q&A** — changing lessons means scrolling past everything. The lesson itself
   is a small box near the top. "Next lesson" is a small secondary button. Note timestamp input shows
   a bare `0` with no label.
3. **Studio and admin are dressed as the marketing site.** Public header + a second nav bar + the
   marketing footer. No app shell.
4. **Visible bugs and inconsistencies:**
   - Studio course table: columns misaligned between Published and Draft rows (badges, learner
     counts and dates sit at different x positions). Pagination rendered above *and* below.
   - Footer shows "Sign in / Create account" to signed-in users.
   - "Account" appears twice on the dashboard (header + page button); page also has its own
     "Purchases" and "Sign out" buttons duplicating header.
   - Dashboard opens on the **empty** tab ("In progress (0)") while "Completed (1)" holds content.
   - Empty state repeats its own heading ("Nothing in progress" / "Nothing in progress — …").
   - Every course card has the identical dark teal gradient with giant faint initials.
   - Brand spelled "GlobalMentor360" in header, "GlobalMentor 360" in footer.
   - Landing page shows language as `en`; the "Preview" button sits above the primary "Buy" CTA.
   - Home stat tiles ("58 Published courses", "Quiz-gated", "Verified") stack as three tall cards on
     phones. Home is 5,327px on a phone.
   - Scroll-reveal fade-up animation on sections (reads as AI-generated per frontend-design).

---

## 4. Design direction: "Course is the hero, certificate is the artifact"

Combines brainstorm directions **1 (course-first)** and **2 (certificate-first)**.

### The idea

GlobalMentor360's real, specific things are: **lessons unlock in order behind quizzes**, and
**every certificate has a serial number anyone can verify**. The design shows those two things
instead of slogans or decoration:

- **Everyday surfaces (home hero, catalog, landing, player, dashboard) lead with the course
  itself** — a real curriculum with done / current / quiz-gate / locked states, like Linear showing
  its own product.
- **The certificate is the one special object** — the only thing with a hard edge and a solid offset
  shadow, the only place bottle green is used as a *surface*, the only place the red seal appears. It
  headlines the second home section, `/certificates/[serial]`, and the completion moment.

"Spend boldness in one place": the course module's highlighter and the certificate object are the
two memorable elements. Everything else is quiet.

### Colour — every colour means something

| Token | Hex | Meaning / only use |
|---|---|---|
| `--paper` | `#fcfcfd` | Page background (cool white — **not** cream) |
| `--surface` | `#ffffff` | Panels, inputs, tables |
| `--ink` | `#1d2242` | Text, primary buttons, primary icons. Blue-black ink, not tinted near-black |
| `--graphite` | `#5e6376` | Secondary text, meta, placeholders (≥ 5.9:1 on white) |
| `--rule` | `#e3e5ec` | Borders and dividers |
| `--control` | `#8a8fa3` | Borders of inputs, selects, checkboxes, secondary buttons. `--rule` is too faint for controls (1.27:1); WCAG 1.4.11 needs 3:1, and this is 3.2:1 |
| `--wash` | `#f3f4f7` | Subtle fills: table header, hover rows, muted surfaces |
| `--mark` | `#f6e35a` | **Highlighter. Only "you are here"**: current lesson in curriculum, current step. Never a button, never decoration. Text on it is `--ink`. |
| `--verified` | `#0b5d46` | Bottle green. **Completed, verified, paid, certificate.** Done ticks, "Paid" status, verify success, certificate surface/shadow. |
| `--seal` | `#d2303f` | Red. **Certificate seal, destructive actions, errors.** |
| `--caution` | `#8a5a00` on `#fbf1d6` | **Pending** only: bKash awaiting verification, draft needing action. |

Replaces the current teal `#0e4f56` + amber `#c2410c` system entirely. Map shadcn tokens:
`--background: paper`, `--foreground: ink`, `--primary: ink`, `--primary-foreground: #fff`,
`--muted: wash`, `--muted-foreground: graphite`, `--border: rule`, `--input: control`, `--ring: ink`,
`--success: verified`, `--destructive: seal`, `--warning: caution`, `--accent` → remove amber (no
second CTA colour; the primary CTA is ink). Light mode only; delete the `.dark` block's usage (keep
nothing that ships dark chrome).

Bangladesh flag nod: bottle green + red disc live **only** in the certificate/seal, as a credential,
not as a flag.

### Type

- **Schibsted Grotesk** (variable, `wght` 400–900, subsets `latin`, `latin-ext`) for
  **everything** — headings, UI and body. It is the face from mockup direction 2. Load via
  `next/font/google`. Replaces Fraunces + Source Sans 3 + Noto Sans Bengali.
- **No Bangla font.** The user said so on 2026-09-25 ("i dont need bangla font 1 and 2 arent
  bangla"). Do not load Anek Bangla or Noto Sans Bengali. Any Bangla text that does appear (course
  content, the `৳` sign) uses the system fallback.
- **IBM Plex Mono** 500/600 **only** for strings a person must read or type exactly: certificate
  serials, bKash transaction IDs, coupon codes, order IDs. Nothing else is monospace.
- Scale (px / line-height): 13/1.45 meta · 15/1.5 UI · 16/1.6 body · 18/1.55 lede · 20/1.35 ·
  24/1.25 · 32/1.12 · 44/1.04 display · 56/1.02 hero (desktop only). **Minimum anywhere: 13px.**
- Headings: weight 650–700, letter-spacing −0.02 to −0.025em at ≥ 32px. Body weight 400; UI
  labels 500; buttons 600.
- `font-variant-numeric: tabular-nums` on prices, durations, counts, dates in tables.
- Sentence case everywhere. `text-wrap: balance` on headings, `pretty` on paragraphs.
- Taka prices written `৳5,990` (symbol, no "BDT " prefix) with `Intl.NumberFormat`; USD `$49`.

### Space, shape, elevation, motion, icons

- Spacing: 4px base — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96. Content max width 1120px; reading
  column 68ch.
- Radius hierarchy (not one radius on everything): badges 4px · controls/buttons/inputs 6px ·
  panels/modules 10px · **certificate 2px** (hard).
- Elevation: panels are defined by `--rule` borders, **no soft grey shadows on cards**. Only two
  shadows exist: popovers/menus/dialogs (`0 8px 24px rgb(29 34 66 / .12)`), and the **certificate's
  solid offset** `10px 10px 0 var(--verified)`.
- Motion: only in response to actions (expand, complete, submit, open menu), 150–220ms,
  transform/opacity only, `prefers-reduced-motion` honoured. **Remove scroll-reveal / fade-up
  section entrances** (`components/site/reveal.tsx`, `motion-provider.tsx` usage). One deliberate
  moment allowed: the tick drawing in when a lesson completes.
- Icons: lucide-react, stroke 1.75, 16/20px, `aria-hidden` when decorative, accessible name when
  alone. **No emoji as icons.**
- Touch: primary actions ≥ 44px tall; every target ≥ 24×24 (WCAG 2.5.8).

### Banned (AI-slop tells from frontend-design — do not reintroduce)

Gradient meshes and gradient washes as decoration · cream background with serif display ·
identical rounded cards with the same soft shadow · ALL-CAPS tracked eyebrow labels above headings ·
dotted "● label" pills · meta strings joined with ` · ` middle dots (use separate elements, commas,
or table cells) · `→` appended to button/link text · accenting one word of a headline in colour or
italic · decorative numbered `01 / 02 / 03` markers on non-sequences · big-number-small-label stat
tiles as a hero device · monospace for general labels · icon-in-a-tinted-square feature grids ·
graduation-cap logo tile.

### Copy voice

**Public copy reads like a course marketplace (Udemy, Coursera, 10 Minute School), not like
product internals.** The user rejected "Learn with structure", "quiz-gated progress" and
"certificates from one academy" (2026-09-25). Say what a buyer gets: courses, subjects, learning at
your own pace, a certificate, paying in taka. Mechanics (quiz gates, serial numbers) are shown in
context on the course and certificate pages, not used as slogans.

- Document titles: `Page | GlobalMentor360`; home is `GlobalMentor360 | Online Courses with
  Certificates`. Meta descriptions ≤ 160 characters, plain.
- Home headline and lede come from `lib/site.ts` (`headline`, `lede`), currently "Build job-ready
  skills with online courses" / "Practical courses in programming, data, business and careers. Learn
  at your own pace, earn a certificate when you finish, and pay in taka with bKash."
- Plain, specific, second person, active voice, sentence case. Buttons say exactly what happens
  ("Browse courses", "Buy course", "Submit transaction ID", "Mark lesson complete"). The same action
  keeps the same name through a flow and in its confirmation. Errors say what happened and how to
  fix it; empty states invite the next action.
- Never describe the business model ("one academy", "single organization") in public copy.

---

## 5. Information architecture: three shells

Replace the single header+footer wrapper in `app/layout.tsx` with route-group shells.

| Shell | Routes | Chrome |
|---|---|---|
| **Site** | `/`, `/courses`, `/courses/[slug]`, `/courses/[slug]/checkout`, `/cart`, `/certificates/[serial]`, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/dashboard`, `/account`, `/orders`, `/orders/[id]`, `/notifications`, not-found | Top bar + slim footer |
| **Learn (focus)** | `/learn/[slug]`, `/learn/[slug]/[itemId]` | No site header/footer. Own top bar + curriculum rail |
| **App** | `/studio/**`, `/admin/**` | Left sidebar + slim top bar. No marketing footer |

Implementation: Next route groups, e.g. `app/(site)/…`, `app/(learn)/learn/…`, and app-shell
layouts in `app/studio/layout.tsx` / `app/admin/layout.tsx`; the root layout keeps only `<html>`,
fonts, and globals. Read `node_modules/next/dist/docs/01-app` on route groups/layouts first. Moving
routes into groups must not change URLs.

### Site top bar

Left: wordmark "GlobalMentor360" (text only, Schibsted Grotesk 700, `--ink`; no icon tile). Nav: Courses,
Verify a certificate. Right, signed out: Sign in, Create account (primary). Right, signed in: My
learning, cart (icon + count), notifications (icon + count), **one account menu** (initials avatar)
containing Account, Orders, Studio (staff), Admin (admin), Sign out. Phone: wordmark + cart +
menu button opening a sheet with the same items. Remove every duplicate of these links from page
bodies.

### Site footer (slim, state-aware)

One row: wordmark, Courses, Verify a certificate, and — **only when signed out** — Sign in /
Create account; when signed in, My learning / Orders instead. © line. No marketing paragraph
repeated from the hero. Brand spelled "GlobalMentor360" everywhere.

### Learn shell (focus mode) — the most important fix

```
┌──────────────────────────────────────────────────────────────────────┐
│ ‹ Course title            [━━━━━━━━──────] 5 of 11        Next lesson │  top bar (sticky)
├───────────────┬──────────────────────────────────────────────────────┤
│ Curriculum    │  Lesson title                                         │
│ ✓ done        │  ┌──────────────────────────────────────────────┐    │
│ ✓ done        │  │ video 16:9  /  article (68ch)  /  quiz        │    │
│ ▌current▐     │  └──────────────────────────────────────────────┘    │
│ ○ next        │  [Mark lesson complete]            [Next lesson]      │
│ ? quiz gate   │  ─────────────────────────────────────────────────   │
│ 🔒 locked      │  Overview | Q&A (12) | Notes (3) | Announcements     │  tabs, URL ?tab=
│  (collapsible)│  …only the selected tab's content…                    │
└───────────────┴──────────────────────────────────────────────────────┘
```

- Desktop ≥ 1024px: left rail 300px, sticky, scrolls independently; collapsible to a thin strip.
  The **current lesson row uses the `--mark` highlighter band**; done rows get a `--verified` tick;
  the quiz gate is its own row ("Pass the section quiz to open section 3"); locked rows are
  graphite with a lock icon.
- Phone/tablet: rail hidden; a **"Contents" button in the top bar opens a sheet** with the same
  list, focus-trapped, Esc closes, returns focus. The lesson appears first, directly under the top
  bar; the tabs follow the lesson. Target: lesson and its Complete/Next actions visible in the first
  viewport on a 375×812 phone.
- Tabs: Overview (lesson description + resources), Q&A, Notes, Announcements — each with a count;
  only one rendered at a time; state in `?tab=` so it deep-links and survives reload.
- Notes: timestamp field labelled "At (m:ss)", prefilled from the video's current time when a video
  is playing; list shows `m:ss` chips that seek the video.
- Completion: when the course hits 100%, the completion banner shows a **small certificate object**
  (serial + "View certificate"), not a generic success alert.

### App shell (studio + admin)

```
┌────────────┬──────────────────────────────────────────────┐
│ GM360      │  Page title                     [primary act] │
│            │  ─────────────────────────────────────────── │
│ Studio     │  table / form                                 │
│  Courses   │                                               │
│  Q&A       │                                               │
│  Announce… │                                               │
│  Coupons   │                                               │
│ Admin      │                                               │
│  Payments  │                                               │
│  Refunds   │                                               │
│  Users     │                                               │
│  Courses   │                                               │
│  Reviews   │                                               │
│ ────────── │                                               │
│ View site  │                                               │
│ Account ▾  │                                               │
└────────────┴──────────────────────────────────────────────┘
```

Sidebar 240px, sections shown by role, active item marked with a left `--ink` bar (not the
highlighter — `--mark` stays reserved for learning position). Phone: sidebar becomes a top bar menu
sheet. Tables are real `<table>` elements with a fixed column template so rows align regardless of
content, sticky header, row hover `--wash`, pagination **below only**, row actions ≥ 24px tall with
padding (whole title cell is the link).

---

## 6. Page-by-page

**Home `/`** — follows the course-marketplace pattern (Udemy, Coursera, 10 Minute School):
1. Hero: headline + lede from `lib/site.ts`, a course search box, "Browse courses". Signed-in
   learners with an in-progress course also see a "Continue learning" strip with that course's
   module (current lesson highlighted) and "Resume".
2. Categories: the top-level categories as plain links with course counts.
3. Popular courses as a **list** (not cards): title, instructor, lessons + duration, rating,
   price. Up to 6, then "All courses".
4. Certificates: "Get a certificate when you finish", "Share it with employers; anyone can check
   it on its own page." A sample **certificate object** (name, course, issue date, serial, seal)
   and a "Check a certificate" input that routes to `/certificates/[serial]`.
5. Why learn here: three plain facts in a row (learn at your own pace / certificate on completion /
   pay in taka with bKash), text only, no icon tiles.
6. Reviews: real reviews ≥ 4 stars with text, max 3.
Remove: stat tiles, numbered "How it works" cards, the final dark CTA band, scroll reveals.

**Catalog `/courses`**
- Filters in a single compact toolbar: search, then Level, Price, Rating, Language, Category, Sort
  (Duration added in phase 2). On phone: search + "Filters" button opening a sheet; applied filters
  shown as removable chips. URL keeps all state.
- Results as **rows** (Linear list), each row: a small generated cover mark (48px square, category
  hue from a fixed restrained set, course initial in Schibsted Grotesk 700 — not giant faded initials), title,
  subtitle (1 line clamp), instructor, lessons + duration, rating, price right-aligned tabular.
  Phone row: cover mark, title, instructor, price; meta wraps below. Target phone page ≤ 3,000px
  for 24 results. Pagination below.
- Empty results: say which filters exclude everything and offer "Clear filters".

**Course landing `/courses/[slug]`**
- Header block: breadcrumb (Courses / Category), title, subtitle, rating, learners, level,
  **language by name** ("English", "Bengali" via `Intl.DisplayNames`, not `en`), instructor link (phase 2 profile).
- Right sticky purchase panel: price, **primary "Buy course"** (or "Enrol for free" / "Go to course"
  when enrolled), secondary "Add to cart", tertiary text link "Watch free preview". Includes list:
  lessons, duration, quizzes, certificate, lifetime access. Phone: sticky bottom bar with price +
  primary action.
- "What you'll learn" (objectives, two columns), curriculum (the same course-module component as
  home, sections expandable, preview items marked), requirements, description, instructor,
  reviews (histogram + list), FAQ (phase 2).

**Certificate `/certificates/[serial]`** — the artifact page
- The certificate object at full size: awarded to, course, issue date, serial in Plex Mono, seal,
  "Verified by GlobalMentor360" with the verified green. Actions: Download PDF, Copy link, Share.
- Plain explanation for employers: what the certificate proves (all lessons done, all quizzes
  passed), date checked. Not-found serial: clear message + verify input to try again.

**Auth (`/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`)**
- Centered single column ≤ 400px on `--paper`, wordmark above, no hero art. Labels above inputs,
  `autocomplete` set (`email`, `current-password`, `new-password`), paste allowed (3.3.8), show
  password toggle, inline errors with `aria-describedby`, "Forgot password?" as a ≥ 24px tall link.

**Checkout `/courses/[slug]/checkout` and cart `/cart`**
- Steps shown as a real sequence (this one *is* a sequence): 1 Review, 2 Pay with bKash, 3 Submit
  transaction ID. Amount in large tabular `৳`; transaction ID input in Plex Mono with
  `autocomplete="off"`, `spellCheck={false}`. Awaiting state uses `--caution`. Stripe block (when
  configured) as a second payment option. Never ask for info already known (3.3.7).
- bKash number is empty (excluded) — keep the existing "number will be shared" copy, restyled.

**Dashboard `/dashboard` ("My learning")**
- Greeting line (not a giant welcome), then **Continue**: the most recent in-progress course as a
  course module with Resume. Then tabs In progress / Completed / Archived, **defaulting to the first
  non-empty tab**. Completed rows show a small certificate chip with serial → certificate page.
- Remove page-level Account / Purchases / Sign out buttons (they live in the account menu).
- Pending bKash payments: a `--caution` notice linking to the order.

**Account `/account`** — sections with a left sub-nav on desktop (Profile, Email, Password,
Sessions, and phase-2 Preferences), single column on phone. Each form saves independently with
inline confirmation. Destructive (revoke session) confirms.

**Orders `/orders`, `/orders/[id]`** — table with status using the colour semantics (Pending =
caution, Paid = verified, Failed/Refunded = seal/graphite). Receipt page printable; IDs in Plex
Mono; show the reject reason to the learner when a bKash payment was rejected (currently hidden).

**Notifications `/notifications`** — list grouped by day, unread marked by a small ink dot, "Mark
all read".

**Studio** (app shell): Courses table (aligned columns: Title+sections, Status, Learners, Updated,
actions), "New course" as a dialog or its own page — not a form permanently beside the table.
Course editor: tabbed (Details, Landing page, Pricing, Curriculum, Publish) instead of one long
page; **fix the 18 unlabeled list inputs** (each gets a visible or `aria-label` "Objective 1" …),
add/remove rows with buttons. Curriculum: section list with lesson rows, reorder by buttons (keyboard
and 2.5.7-compliant), drag added in phase 2 as an enhancement only. Lecture editor, quiz builder,
Q&A inbox, announcements, coupons restyled into the shell.

**Admin** (app shell): Payments queue as rows (learner, courses, amount, trx ID in Plex Mono,
submitted time) with Approve / Reject (reject opens a dialog requiring a reason). Refunds, Users,
Courses, Reviews as aligned tables with search.

---

## 7. Components

Rebuild or restyle in `components/`:

- `ui/*` (shadcn): re-theme via tokens; button variants `primary` (ink), `secondary` (surface +
  rule border), `ghost`, `destructive` (seal), sizes sm 32 / md 40 / lg 44; badge variants map to
  the colour semantics; table with fixed layout; tabs with visible selected state meeting contrast;
  add `sheet` (drawer) for phone menus and the curriculum.
- New: `course-module` (curriculum with done/current/gate/locked states — used by home, landing,
  player rail, dashboard), `certificate` (the artifact; sizes: full, card, chip), `cover-mark`,
  `price` (Intl, tabular), `app-shell` + `app-sidebar`, `learn-shell` + `learn-topbar` +
  `curriculum-sheet`, `account-menu`, `status-badge` (semantic), `serial` (Plex Mono, copy button).
- Delete/replace: `course-card` (grid card) → `course-row`; `reveal.tsx` and motion-provider
  scroll reveals; `page-nav` duplicates.
- Replace `design-system/MASTER.md` (Cursor's teal/amber/Fraunces system) with a short pointer to
  this spec, so no future worker follows the old rules.

---

## 8. Accessibility requirements (WCAG 2.2 AA — definition of done)

- **0 axe violations** (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) on every audited route, both
  viewports.
- All text ≥ 13px; contrast ≥ 4.5:1 text, ≥ 3:1 UI components and focus indicators (1.4.11).
- Every interactive target ≥ 24×24 (2.5.8); primary actions ≥ 44px tall.
- Visible `focus-visible` ring (2px ink + 2px offset) on everything; nothing obscured by sticky bars
  (2.4.11) — use `scroll-padding-top` equal to the sticky bar height.
- Skip link first; landmarks (`header`, `nav` with labels, `main`, `aside`, `footer`).
- Sheets/dialogs: focus trap, Esc to close, return focus, `overscroll-behavior: contain`.
- Tabs follow the ARIA tabs pattern (Radix) with arrow-key navigation.
- Forms: visible labels, `autocomplete`, errors inline + `aria-describedby` + focus first error,
  no paste blocking, correct input types.
- Dragging (2.5.7): any drag reorder must keep the button alternative.
- Consistent help (3.2.6): help/support link in the same place (footer + account menu).
- Captions available for video; transcripts phase 2.
- Reduced motion respected. Zoom to 200% and reflow at 320px without horizontal scroll.
- No emoji icons; decorative icons `aria-hidden`.

---

## 9. Data hygiene (phase 0 — do first; it's the biggest visual damage)

1. **Separate test database.** Create `globalmentor360_test` in the same container. Point the
   integration suite, e2e specs, and `scripts/seed-volume.ts` at it via `TEST_DATABASE_URL` (or
   override `DATABASE_URL` in `tests/integration/setup.ts` and Playwright's `webServer.env`).
   **Guard:** test setup throws unless the database name ends in `_test`. Migrate it with
   `prisma migrate deploy` against the test URL. Document in AGENTS.md / README.
2. **Clean the dev database.** Fixture courses/users/notes/questions/announcements/reviews/coupons
   must go. Preferred: `prisma migrate reset` + seed — **destructive; Prisma requires explicit user
   consent (quote their message in `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). Ask the user
   first.** Non-destructive fallback: a scoped cleanup script that deletes rows matching fixture
   patterns (`vol-%`, `QA %`, `rollup-course-%`, `%@example.com` users other than the three seed
   accounts, notes/questions containing 13-digit timestamps), with a dry-run count first.
3. **Realistic seed.** Replace placeholder content ("Placeholder article body.") with a small
   believable catalog: ~6 published courses across 3–4 categories (e.g. TypeScript Foundations, SQL
   for Analysts, Postgres for Application Developers, Excel for Business Reporting, Spoken English
   for Interviews, Python Basics), each with objectives, requirements, audience, 2–3 sections,
   article lessons with real paragraphs, a section quiz, BDT prices, and a few reviews from
   plausible learner names. Keep the three seed accounts and `SAVE10`. Idempotent.
4. Home page and any "featured" query must exclude courses/reviews that are not genuinely published
   content (no test filter hacks needed once the data is clean, but never show reviews without text).

---

## 10. Implementation phases (UI/UX first)

| Phase | Scope | Done when |
|---|---|---|
| **0 Foundation** | Test DB isolation; dev data reset (ask consent) + realistic seed; move audit harness into `scripts/ui-audit/` with `axe-core` as a devDependency; fix the 2 real lint errors; eslint-ignore `.cursor/**` | Suites green against `_test` DB; dev catalog shows only real content; `npm run ui-audit` works |
| **1 Tokens & type** | New tokens in `globals.css`; Schibsted Grotesk + Plex Mono via next/font; remove Fraunces/Source Sans/Noto Sans Bengali; base `ui/*` restyle; remove reveal animations; replace `design-system/MASTER.md` | Build green; no teal/amber left (`grep`) |
| **2 Shells** | Route groups; site top bar + account menu + state-aware footer; learn shell; app shell | Every route renders in the right shell; URLs unchanged |
| **3 Core components** | course-module, certificate, cover-mark, course-row, price, status-badge, serial, sheet | Unit/visual check |
| **4 Public pages** | Home, catalog, landing, certificate, auth, checkout, cart, not-found | Audit clean on these routes |
| **5 Learner pages** | Player (tabs, rail, sheet, notes timestamp), dashboard, account, orders, notifications | Player phone: lesson + actions in first viewport |
| **6 Studio & admin** | All studio/admin pages in app shell; aligned tables; course editor tabs; label fixes | Audit clean |
| **7 Verify** | Full audit, keyboard pass, screenshots reviewed desk + phone, all suites, build | Section 13 criteria met |
| **8+ Features** | Section 12 | Per feature |

Each phase: commit + push on `claude/ui-ux-overhaul`, update the progress log below.

---

## 11. Verification (definition of done for the UI/UX work)

- `npm run lint` 0 errors; `npm run typecheck` clean; `npm run test`, `npm run test:db`,
  `npm run test:db:flows` green (against the test DB); `npm run build` green.
- UI audit (`scripts/ui-audit`) on all routes, both viewports: **0 axe violations, 0 text < 13px,
  0 overflow, 0 real targets < 24px**, no console errors.
- Keyboard pass: skip link first, visible focus everywhere, nothing obscured, sheets trap focus.
- Screenshots of every route at 1440 and 375 reviewed by eye against this spec; phone player shows
  the lesson and its actions in the first 812px; phone catalog ≤ 3,000px for a full page.
- `grep` finds no banned patterns: no `#0e4f56`/`#c2410c`, no `Fraunces`, no `→` in button labels,
  no `uppercase tracking` eyebrows, no ` · ` meta joins in JSX, no `Reveal` usage.
- Existing behaviour unchanged: invariants in `docs/TECH-SPEC.md` (entitlement via enrollments,
  bKash verifier constraint, derived progress rollup, etc.) — covered by the existing suites.

---

## 12. Remaining features (phase 8+, after the UI/UX work)

Excludes email delivery, bKash number, domain/hosting (user handles those).

**Missing entirely (6)**
1. Public instructor profile page `/instructors/[slug]` (bio, headline, courses, aggregate rating) +
   studio profile editor (headline/bio exist in schema, no editor).
2. Downloadable lecture resources: upload files to S3 per lecture, signed download for enrolled
   learners (`lecture_resources` exists, no UI).
3. External resource links per lecture (same table, URL kind).
4. Instructor course analytics: enrollments over time, completion rate, rating trend, per-lecture
   drop-off (events already recorded in `analytics_events`).
5. Admin taxonomy editor: categories/topics/skills CRUD.
6. Admin background job monitoring: video assets by status (processing/failed), retry, recent
   MediaConvert errors, SQS drain status.

**Partial → complete (from the 68-item P0 audit)**
- Account preferences: timezone, language, notification preferences.
- Catalog: duration filter; course FAQ (authoring + landing display).
- Player: video quality selector (HLS levels), auto-advance on/off toggle, audio lecture type, PDF
  lecture type, interactive transcript from captions.
- My learning: archive / unarchive action.
- Ratings: recency weighting in the aggregate (document the formula).
- Studio: drag-and-drop curriculum reorder (keep buttons), resumable/multipart video upload with
  progress, course thumbnail + promo video upload, **in-review** lifecycle (instructor submits,
  admin approves/returns with notes).
- Admin users: suspend/unsuspend (uses `UserStatus`), audited time-limited impersonation (security
  sensitive — confirm scope with the user before building), grant course without payment
  (`grantEnrollment(..., "GRANT")`, audited — noted as missing in PRODUCT-STATUS).
- Admin courses: feature/pin on home, edit taxonomy.
- Learner sees the bKash reject reason on the receipt.
- Instructor reply to a review (`review_responses` exists).

Order: reject-reason + archive + FAQ + duration filter (small) → instructor profile + resources/links
→ in-review lifecycle + thumbnails → analytics + job monitoring + taxonomy → player extras
(quality, auto-advance, audio/PDF, transcript) → multipart upload + drag reorder → admin
suspend/grant (impersonation last, after confirming with the user).

---

## 13. Risks and open questions

- **Dev DB reset needs the user's explicit consent** (Prisma AI guard). Ask when phase 0 reaches it.
- Route-group restructuring touches every page file path; do it in one commit with the build
  proving URLs unchanged, and keep e2e specs passing.
- `৳` (U+09F3) is not in Schibsted Grotesk; it falls back to a system font. Check early in phase 1
  that it sits well next to the digits at 15–32px on Windows; if not, show prices as `Tk 5,990`.
- Impersonation is security-sensitive; confirm scope before building.
- Old screenshot scripts (`scripts/design-shots*.mjs`, `scripts/p1-shots.mjs`, `verify-pages.ts`)
  reference fixture slugs (`vol-big-course`); update or retire them after the data reset.
- Direction 3 (Bangla-first UI) was not chosen, and the user does not want a Bangla font.

---

## 14. Reference: current code map (at start)

- Root layout `app/layout.tsx`: fonts Fraunces/Source Sans 3/Noto Sans Bengali, `SiteHeader`,
  `SiteFooter`, `MotionProvider`, `#main` wrapper.
- Header `components/site/header.tsx` (server; roles decide nav) + `header-nav.tsx`
  (`HeaderNav`, `HeaderActions`), footer `components/site/footer.tsx`.
- Studio layout `app/studio/layout.tsx` (`requireRole("INSTRUCTOR","ADMIN")`, `StudioNav`), admin
  `app/admin/layout.tsx` (`requireRole("ADMIN")`, `AdminNav` in `admin-nav.tsx`).
- Player `app/learn/[slug]/[itemId]/page.tsx` (308 lines): grid `[1fr_18.75rem]`, sections in
  order: header, completion banner, VideoPlayer / article, CompleteLectureForm, QuizForm, NotesPanel,
  AnnouncementsPanel, QaPanel; `aside` curriculum sticky. Sibling files: `actions.ts`,
  `announcements-panel.tsx`, `ask-question-form.tsx`, `complete-lecture-form.tsx`, `note-actions.ts`,
  `notes-panel.tsx`, `qa-actions.ts`, `qa-panel.tsx`, `quiz-form.tsx`, `reply-form.tsx`,
  `video-player.tsx`.
- Tokens `app/globals.css` (shadcn variable pattern + `@theme inline`), 191 lines.
- Components: `components/ui/*` (accordion, alert, avatar, badge, button, card, dialog,
  dropdown-menu, input, label, progress, select, separator, skeleton, table, tabs, textarea),
  `components/site/*` (course-card, empty-state, field-error, flash-alert, footer, header,
  header-nav, motion-provider, notifications-menu, page-nav, rating-histogram, reveal, review-list,
  sign-out-button, star-rating, status-badges), `components/checkout/*`, `components/auth/*`.
- Routes (36): see `npm run build` output; public, learner, studio (courses, curriculum, item,
  qa, announcements, coupons), admin (payments, refunds, users, courses, reviews), API
  (`auth`, `captions/[id]`, `video/webhook`, `webhooks/stripe`), certificate PDF.
- Tests: `tests/integration/*.test.ts` (setup overrides Stripe/email env), `prisma/tests/*.sql`,
  `e2e/*.spec.ts` (critical-path, qa-admin, qa-learner, qa-studio, responsive, api-verify).

---

## 15. Audit harness (to be moved into the repo in phase 0)

Current location: session scratchpad `…\scratchpad\audit\` — `audit.mjs` (routes × viewports ×
roles; axe + overflow + targets + tiny text + h1/main + console + screenshots → `out/results.json`,
`out/shots/*.png`), `keyboard.mjs` (tab-order focus visibility, obscured focus, 320px reflow),
`summarise.cjs` (rolls results up). Signs in via `POST /api/auth/sign-in/email` with an `origin`
header. IDs it used (will change after the data reset — look them up again):
course `typescript-foundations`, buy course `sql-for-analysts`, studio course
`019fdc84-70af-71bb-a17c-4af28d35e039`, cert `GM360-302E-CA7A-7603-8B4B`.

---

## 16. Tenancy

Single tenant now; built so a second academy can be added without a rewrite (user, 2026-09-25).

- **Done:** `lib/site.ts` is the only place the storefront's name, title, description, home copy,
  origin, locale, currency and certificate prefix live. Metadata, header, footer, emails, the
  certificate PDF, certificate serials and every absolute URL read `getSite()` / `siteUrl()`. A test
  (`lib/site.test.ts`) keeps tenancy and product-internal wording out of public copy.
- **When a second tenant arrives:** `getSite()` resolves the tenant from the request host (in
  `proxy.ts`, Next 16's middleware) and returns that tenant's `SiteConfig` from a `tenants` table;
  add `tenantId` to `courses`, `categories`, `coupons`, `orders`, `payments`, `certificates`,
  `announcements` and a `tenant_members` join for users/roles; scope every query by it (a Prisma
  client extension that injects the filter); per-tenant bKash number and SES sender.
- **Not done now (YAGNI):** no tenant tables or columns until there is a second tenant.

---

## 17. Progress log

| Date | Phase | What landed | Commit |
|---|---|---|---|
| 2026-09-25 | setup | Branch `claude/ui-ux-overhaul`; checkpoint of Cursor design pass | `ada4df3` |
| 2026-09-25 | brainstorm | Audit, standards review, directions chosen (1+2), this spec | `10bf46a` |
| 2026-09-25 | spec | No Bangla font (user); Schibsted Grotesk replaces Anek Bangla; `--control` token for 1.4.11 | (this commit) |
| 2026-09-25 | plan | Plan 1 (phase 0 + 1) at `docs/superpowers/plans/2026-09-25-ui-ux-overhaul-foundation.md` | `44f80a1` |
| 2026-09-25 | 0 | Lint 0 errors; addToCart double-click race fixed; suites/e2e/volume fixture on `globalmentor360_test` (guarded); e2e on :3100, one worker | `5e206f2` `cfc3d49` `7c78d25` |
| 2026-09-25 | 0 | Six-course seed with real lessons, reviews, learner journey (Python Basics finished + certificate, TypeScript stopped at first quiz). **Dev DB fully reset with the user's consent** ("Full reset"): their Gmail test account and the Pogash Pro Coder video course are gone | `0a2777c` |
| 2026-09-25 | 0 | Audit harness in `scripts/ui-audit` (`npm run ui-audit`, `:summary`, `:keyboard`). Baseline on clean data: 56 loads OK; axe `label` ×28 (studio-course objectives inputs), `color-contrast` ×50 (dashboard tab trigger, player curriculum); 12px text on 48 loads; 26 targets < 24px (20px table/nav links, 16px checkboxes, "Forgot password?" 16px); no overflow; one h1 + main everywhere; keyboard: skip link first everywhere, dashboard tab panel focusable without indicator; longest phone page home 5,445px | (this commit) |
| 2026-09-25 | 1 | Palette as code with contrast proofs; globals.css tokens, 13px floor, Schibsted Grotesk + Plex Mono | `0df80fd` |
| 2026-09-25 | 1 | Base components restyled; one `focus-ring`; dashboard contrast fixed | `12b039b` |
| 2026-09-25 | 1 | User feedback: marketplace-style titles/descriptions, no "one academy". `lib/site.ts` tenancy seam; home hero rewritten; footer slim + state-aware | `66fd4b1` |
| 2026-09-25 | 1 | Scroll reveals, all-caps labels and sub-13px text removed; MASTER.md retired. **Plan 1 done.** Audit: 0 text < 13px, 0 overflow, 0 console errors, keyboard 0 problems; left for later plans: axe `label` (studio-course, plan 6), `color-contrast` in player curriculum (plan 5), 23px row links (plans 4–6). Suites: unit 359, integration 155, SQL 24, e2e 42 + 1 skip | (this commit) |
| 2026-09-24 | 2 | Plan 2 (`docs/superpowers/plans/2026-09-25-ui-ux-overhaul-shells.md`) done in a cloud session (Linux, local Postgres 16, no Docker: SQL suites run with `psql`; `PLAYWRIGHT_CHROMIUM_PATH` points e2e/audit at the installed Chromium). Route groups `(site)`, `(learn)`, `(app)`; build route list unchanged plus `/certificates` (verify by number) and `/help`. Site top bar with one account menu and a phone Menu sheet; footer adds Verify and Help (3.2.6). Player in focus mode: own top bar, 300px collapsible rail, Contents sheet on phones. Studio/admin in a 240px sidebar app shell. `Sheet` primitive shipped here (not plan 3). Studio's router.push workaround removed (plain link works). Suites: unit 370, SQL 24, flows 155, e2e 42 + 1 skip. Audit: player `color-contrast` gone; left: axe `label` on studio-course (plan 6), 23px links in studio/admin tables (plan 6), "Forgot password?" (plan 4), 16px checkboxes, landing accordion triggers without focus indicator (plan 3 replaces them). No overflow, no text < 13px, no console errors | (this commit) |
| 2026-09-24 | 3 | Plan 3 (`…-components.md`) done: `Price` (`৳5,990`, `$49`), `StatusBadge` (`lib/status.ts`), `Serial` (Plex Mono + copy), `CoverMark` + `CourseRow` (course cards deleted; phone catalog 3,050 → ~1,560px), `CourseModule` (player / outline / compact over `lib/course-module.ts`), `Certificate` (full, card) + `CertificateChip` + `Seal`. Found: **Schibsted Grotesk's tabular figures make `,` and `.` a figure wide** (`৳5 , 990`, `4 . 5`): `Price` renders separators proportionally; ratings and decimals drop `tabular-nums` (rule for plans 4–6). `৳` renders from the fallback font (FreeSans on Linux) and reads fine at 15–32px; not checked on Windows. Cover tints keyed by course slug, not category (six categories hashed onto six tints put five of six seed courses on one colour). Landing "Preview: …" button → "Watch free preview" so the outline's `Preview: {lesson}` links stay unique. Suites: unit 408, SQL 24, flows 155, e2e 42 + 1 skip; audit unchanged except the landing accordion (focus indicator now present) | (this commit) |
| 2026-09-24 | 4 | Plan 4 (`…-public-pages.md`) done: home (search, continue card, subjects with counts, popular rows, sample certificate + check form, three facts, 4★+ reviews; phone 5,445 → 3,923px), catalog (labelled filters applied by client navigation that keeps focus — 3.2.2; filter sheet on phones; chips; empty state names the filters; subject filter includes subcategories), course page (facts, sticky purchase panel with one primary action — "Buy course" / "Enrol for free" / "Go to course" — phone purchase bar, outline curriculum, lessons and quizzes counted apart), certificate page (actions, what it proves, not-found with the verify form), auth (400px column, show-password toggle, errors wired to fields), checkout + cart as 1 Review / 2 Pay / 3 Submit transaction ID (Plex Mono ID, date defaults to today in Dhaka via `site.timeZone`, zero-total coupon path), 404 with search. `Alert` has caution/verified variants and no default `role`. New: `lib/categories.ts`, `lib/continue-learning.ts`, `siteToday()`. Suites: unit 414, SQL 24, flows 156, e2e 42 + 1 skip. Audit: public routes 0 axe, 0 small targets, 0 tiny text, 0 overflow; keyboard 0 problems. Left: studio `label` (plan 6), 16px quiz/notes radios in the player (plan 5), studio/admin 23px links (plan 6) | (this commit) |
| 2026-09-25 | 5 | Plan 5 (`…-learner-pages.md`) done: player puts the lesson first with Overview / Notes / Q&A / Announcements in tabs mirrored to `?tab=` (notes stamp and seek the video time; article lessons have headings and code styling; the certificate card shows when a course is finished); My learning (continue card, In progress / Completed tabs with certificate chips, pending bKash payments); Account as Profile / Email / Password / Devices sections (name is now editable — the help page already said so; sign-outs confirm first; devices past five sit behind a disclosure); Orders as a table with a printable receipt; notifications grouped by the site's calendar day with an unread dot. **Rejecting a bKash payment now tells the learner why**: the reason shows on their receipt with "Pay again" and arrives as a notification (spec §12's first item; the admin hint says so). Progress labels round down to a whole percent everywhere (the player said 22.2% while My learning said 22%). The cloud container restarted mid-phase: Postgres was restarted with `service postgresql start`; dev DB intact. Suites: unit 426, SQL 24, flows 157, e2e 42 + 1 skip. Audit: learner routes 0 axe, 0 small targets, 0 tiny text, 0 overflow; keyboard 0 problems. Left for plan 6: studio-course `label` ×28, 23px studio/admin links | (this commit) |
