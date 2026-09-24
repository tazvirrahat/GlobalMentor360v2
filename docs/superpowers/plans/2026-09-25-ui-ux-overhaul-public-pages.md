# UI/UX overhaul, plan 4: public pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the pages a buyer sees (spec §6): home, catalog, course landing page, certificate page, sign-in / sign-up / forgot / reset, checkout, cart and the 404, on the plan 2 shells and plan 3 components, and bring each to 0 axe violations, 0 targets under 24px, no text under 13px.

**Architecture:** Pages stay server components that read through `lib/*`. New read helpers are small and tested at the unit level where they contain logic (category counts' tree roll-up, the "continue learning" pick). Interactive pieces stay small client components: the catalog toolbar (client navigation that keeps focus, a filter sheet on phones), the password field's show/hide toggle, the certificate's copy/share buttons, and the landing page's phone purchase bar. Copy reads like a course marketplace and comes from `lib/site.ts` where it is brand copy.

**Tech Stack:** Next.js 16.3 (server components, `searchParams`, `next/navigation` `useRouter`/`useSearchParams`), React 19.2 (`useTransition`), Tailwind v4 tokens, the plan 3 components, Vitest, Playwright.

**Spec:** §4 (copy voice, banned patterns), §6 (page-by-page), §8 (accessibility). Plans 2 and 3 are done.

## Global Constraints

- Buttons say what happens: "Browse courses", "Buy course", "Enrol for free", "Go to course", "Add to cart", "Watch free preview", "Submit transaction ID", "Check certificate". The same action keeps its name through a flow.
- No numbered decorative markers, stat tiles, icon tiles, dark CTA bands, ` · ` joins, `→`, all-caps. The checkout steps are a real sequence and may be numbered.
- `tabular-nums` only on integers without separators, or through `Price` (Schibsted's tabular comma and period are a figure wide — see plan 3). Ratings and percentages with a decimal point use proportional figures.
- 3.2.2 On Input: changing a filter must not reload the page or move focus. The catalog toolbar navigates client-side and keeps the control focused; results changes are announced in a polite live region.
- 3.3.8 Accessible Authentication: paste allowed, `autocomplete` on every field, show/hide password toggle.
- 3.3.7 Redundant Entry: checkout never asks for the learner's name or email.
- The bKash receiving number stays out of scope: keep the "shared by the academy" copy when `BKASH_MERCHANT_NUMBER` is empty (e2e checks it).
- e2e keeps its intent: when a label changes on purpose, change the spec's selector to the new label in the same commit.

## File map

| File | Change | Responsibility |
|---|---|---|
| `components/ui/alert.tsx` | modify | `caution` and `verified` variants; no default `role` (static notices are not alerts) |
| `lib/categories.ts`, `lib/categories.test.ts` | create | top-level categories with published-course counts (children roll up) |
| `lib/courses.ts` | modify | category filter matches a category or its parent |
| `lib/continue-learning.ts`, `lib/continue-learning.test.ts` | create | the learner's most recent in-progress course and its next lesson, as a compact module |
| `components/course/continue-card.tsx` | create | "Continue learning" card (compact module + Resume) — home and dashboard |
| `app/(site)/page.tsx` | rewrite | hero + search, continue strip, categories, popular list, certificate section, three facts, reviews |
| `app/(site)/courses/page.tsx`, `catalog-toolbar.tsx` | rewrite | toolbar, filter sheet, chips, rows, empty state naming the filters |
| `app/(site)/courses/[slug]/page.tsx` | rewrite | header block, purchase panel, phone purchase bar, sections |
| `app/(site)/courses/[slug]/purchase-bar.tsx` | create | phone sticky price + primary action |
| `components/site/rating-histogram.tsx`, `review-list.tsx`, `star-rating.tsx` | modify | ink stars, no tabular decimals, 13px floor |
| `app/(site)/certificates/[serial]/page.tsx`, `certificate-actions.tsx`, `app/(site)/certificates/not-found.tsx` | rewrite/create | full certificate, Download / Copy link / Share, employer explanation, not-found with the verify form |
| `components/auth/password-input.tsx` | create | password field with show/hide toggle |
| `components/auth/auth-layout.tsx` | create | the 400px auth column |
| `app/(site)/sign-in/*`, `sign-up/*`, `forgot-password/*`, `reset-password/*` | modify | on the auth layout; inline errors wired with `aria-describedby`; 24px+ "Forgot password?" |
| `components/checkout/checkout-steps.tsx` | create | the 1–2–3 sequence frame |
| `components/checkout/bkash-quote.tsx`, `bkash-proof-form.tsx` | rewrite | review list, amount, bKash steps, transaction ID in Plex Mono |
| `app/(site)/courses/[slug]/checkout/page.tsx`, `app/(site)/cart/page.tsx` | rewrite | steps, caution awaiting state, Stripe as a second option |
| `app/not-found.tsx`, `app/(site)/error.tsx` | modify | final copy and look |
| `e2e/*.spec.ts` | modify | renamed actions |

---

### Task 1: Alerts that mean something

**Files:** Modify `components/ui/alert.tsx`; call sites that relied on the default `role="alert"`.

- [ ] **Step 1:** Variants: `default` (surface, rule border), `caution` (`bg-caution-wash border-caution/30 text-caution`, description `text-ink`), `verified` (`bg-surface border-verified/40`, icon `text-verified`), `destructive` (seal border and title, `text-ink` description). Remove the hard-coded `role="alert"`; callers pass `role="alert"` for errors that appear after an action and `role="status"` for confirmations. A notice present on page load gets no role.
- [ ] **Step 2:** `grep -rn "<Alert" app components` and give each call site the right role. FieldError keeps `role="alert"` (it appears after submit). Run `npx playwright test --grep "alert"`-adjacent specs (qa-admin uses `getByRole("alert")` after a failed action — still an alert).
- [ ] **Step 3: Commit** `Give notices a colour that means something and stop announcing static ones`.

### Task 2: Category counts, and filters that include subcategories

**Files:** Create `lib/categories.ts`, `lib/categories.test.ts`. Modify `lib/courses.ts` (`catalogWhereSql`, `catalogPrismaWhere`, `listCatalogCategories`).

**Interfaces:**

```ts
export type CategoryNode = { id: string; name: string; slug: string; parentId: string | null; position: number };
export type CategoryCount = { name: string; slug: string; count: number; children: { name: string; slug: string; count: number }[] };
export function rollUpCategoryCounts(nodes: CategoryNode[], countsByCategoryId: Map<string, number>): CategoryCount[];
export async function listTopCategoriesWithCounts(): Promise<CategoryCount[]>; // only categories with ≥ 1 published course
```

- [ ] **Step 1: Tests** for `rollUpCategoryCounts`: a parent's count is its own plus its children's; empty branches are dropped; order follows `position`, then name.
- [ ] **Step 2:** Implement; the DB read is one `groupBy` on `courses.primaryCategoryId` for `PUBLISHED`, plus one `category.findMany`.
- [ ] **Step 3:** The catalog's `categorySlug` filter matches `cat.slug = $1 OR parent.slug = $1` (SQL join on `categories parent ON parent.id = cat."parentId"`; the Prisma `where` uses `OR: [{ primaryCategory: { slug } }, { primaryCategory: { parent: { slug } } }]`). Integration test in `tests/integration/catalog-search.test.ts`: filtering by a parent slug returns its children's courses.
- [ ] **Step 4:** `listCatalogCategories()` returns the tree (parents with published courses in them or their children), so the catalog's Category select shows parents with their subcategories as an `<optgroup>`.
- [ ] **Step 5: Commit** `Count courses per top-level category and let a parent category filter its children`.

### Task 3: Continue learning

**Files:** Create `lib/continue-learning.ts`, `lib/continue-learning.test.ts`, `components/course/continue-card.tsx`.

**Interfaces:**

```ts
export function pickResumeItem(items: { id: string; locked: boolean; completed: boolean }[]): string | null; // first unlocked incomplete, else first unlocked
export async function getContinueLearning(userId: string): Promise<{
  course: { title: string; slug: string; percent: number; done: number; total: number };
  sections: ModuleSection[];
  currentId: string;
} | null>; // the in-progress course with the most recent course_progress.updatedAt (enrolledAt breaks ties)
```

`ContinueCard({ data, headingLevel })`: a panel (`rounded-lg border border-rule bg-surface p-5`) with the course title (link to `/learn/{slug}`), "{done} of {total} lessons done" and a thin progress bar, the `CourseModule variant="compact"`, and a primary "Resume" button (`/learn/{slug}/{currentId}`, name "Resume {course title}" via `aria-label`, visible text "Resume").

- [ ] **Step 1:** Tests for `pickResumeItem` (same rule as `/learn/[slug]`'s index redirect; the page is refactored to call it).
- [ ] **Step 2:** Implement `getContinueLearning` on `getMyLearning` + `getPlayerCourse`.
- [ ] **Step 3: Commit** `Add the continue-learning card`.

### Task 4: Home

**Files:** Rewrite `app/(site)/page.tsx`.

Sections, in order (each a `<section aria-labelledby>`; one h1):

1. **Hero** — `site.headline` (h1, 44/56px, balance), `site.lede` (18px graphite), a search form (`role="search"`, GET `/courses`, labelled input "Search courses", 44px, primary "Search"), and "Browse courses" (secondary, 44px). No second CTA to sign up (the top bar has it). Signed-in learner with an in-progress course: the `ContinueCard` beside the hero on desktop (`lg:grid-cols-[1fr_24rem]`), under it on phones.
2. **Categories** — h2 "Explore by subject"; top-level categories as a wrapped list of plain links "Development 4 courses" (name 16/600, count 13 graphite), each ≥ 44px tall, linking to `/courses?category={slug}`.
3. **Popular courses** — h2 "Popular courses"; up to 6 `CourseRow`s (`sort: "popular"`), then a text link "See all courses" to `/courses`.
4. **Certificates** — h2 "Get a certificate when you finish"; paragraph "Share it with employers. Anyone can check it on its own page."; a sample `Certificate size="card"` (recipient "Your name", the most popular course's title, today, serial `{prefix}-1A2B-3C4D-5E6F-7A8B`) captioned "Sample certificate"; a "Check a certificate" form (GET `/certificates`, labelled "Certificate number", Plex Mono input, "Check certificate").
5. **Why learn here** — h2 "Why learn here"; three plain facts in a row (`sm:grid-cols-3`), each an h3 and one sentence: "Learn at your own pace" / "A certificate when you finish" / "Pay in taka with bKash" (+ "or by card" when Stripe is configured). Text only.
6. **Reviews** — h2 "What learners say"; up to 3 visible reviews rated ≥ 4 with text (`listHomeTestimonials` gains `minRating`), as a list: stars (ink), body, name, course title.

Remove: numbered "How it works", the dark CTA band, cards.

- [ ] **Step 1:** Build it. **Step 2:** Screenshots at 1440 and 375; phone page ≤ 3,500px. **Step 3: Commit** `Rebuild the home page like a course marketplace`.

### Task 5: Catalog

**Files:** Rewrite `app/(site)/courses/page.tsx`, `app/(site)/courses/catalog-toolbar.tsx`.

- [ ] **Step 1: Toolbar (client).** One `<form role="search">` (GET `/courses`, works without JS). Desktop (`lg`): search input + "Search" button, then Level, Price, Rating, Language (only when > 1), Category (optgroups), Sort, each a labelled `<select>` (visible 13px label above, `h-10`). On change: `router.replace(nextUrl, { scroll: false })` inside `startTransition`; focus stays on the select; `aria-busy` on the results while pending. Below `lg`: search + a "Filters" button (with the active count, "Filters, 2 applied") opening a bottom `Sheet` with the same selects stacked and "Show results" (submit) / "Clear all" — filters apply on submit there, not on change.
- [ ] **Step 2: Results.** `<p role="status" aria-live="polite">` "6 courses" / "3 courses match ‘python’"; applied filters as removable chips (`min-h-8`, "Remove filter: Beginner"); rows in a `<ul>`; `PageNav` below only.
- [ ] **Step 3: Empty.** Say which filters exclude everything ("No courses match ‘x’ at Advanced level.") and offer "Clear filters" (primary) plus one chip per filter to remove just that one.
- [ ] **Step 4:** e2e `Search courses` label and "Search" button keep their names.
- [ ] **Step 5: Commit** `Rebuild the catalog toolbar: filters that keep focus, a filter sheet on phones`.

### Task 6: Course landing page

**Files:** Rewrite `app/(site)/courses/[slug]/page.tsx`; create `purchase-bar.tsx`; modify `components/site/rating-histogram.tsx`, `review-list.tsx`, `star-rating.tsx`.

- [ ] **Step 1: Header block** — breadcrumb `Courses / {Category}` (the category links to the filtered catalog), h1 title, subtitle (18px graphite), a facts list (separate items, no dots): rating ("4.5 (2 ratings)" linking to `#reviews`) or "No ratings yet", "{n} learners", level, language by name (`Intl.DisplayNames(["en"], { type: "language" })`: "English", "Bengali"), "Updated {month year}"; "Created by {instructor}".
- [ ] **Step 2: Purchase panel** (right column, sticky `top-24`, `rounded-lg border`): `CoursePrice` 32px; enrolled → "Go to course" (primary); free → "Enrol for free"; for sale → "Buy course" (primary, 44px) and "Add to cart" (secondary; signed out: "Sign in to add to cart" link); "Watch free preview" (text link, when a preview exists). "This course includes": lessons count, total video/article time, quizzes count, "Certificate of completion", "Lifetime access" — icon + text rows, icons 16px graphite, no tinted circles.
- [ ] **Step 3: Phone purchase bar** (`purchase-bar.tsx`, client only for the sentinel): below `lg`, a `fixed bottom-0` bar with the price and the primary action, shown once the panel scrolls out of view (IntersectionObserver on the panel); `pb-[env(safe-area-inset-bottom)]`; the page gets bottom padding so the footer is not covered.
- [ ] **Step 4: Body sections** — "What you'll learn" (two columns, verified ticks), "Course content" (`CourseModule variant="outline"`, summary "{sections} sections, {lessons} lessons, {duration}"), "Requirements", "Description" (68ch), "Who this course is for", "Instructor" (name, headline, bio; initials avatar), "Reviews" (`#reviews`: average in 44px proportional figures with stars, histogram in ink, `ReviewForm` for enrolled learners, list, pager).
- [ ] **Step 5:** `star-rating.tsx`/`rating-histogram.tsx`/`review-list.tsx`: stars and bars in `ink` (the `--star` token is ink already), empty stars `text-rule`, counts 13px, no tabular decimals.
- [ ] **Step 6:** e2e: "Buy this course" → "Buy course" in `qa-learner.spec.ts`.
- [ ] **Step 7: Commit** `Rebuild the course page: facts, a clear purchase panel, a phone purchase bar`.

### Task 7: Certificate page

**Files:** Rewrite `app/(site)/certificates/[serial]/page.tsx`; create `certificate-actions.tsx` (client); rewrite `app/(site)/certificates/not-found.tsx`.

- [ ] **Step 1:** Above the object: a verified line — `BadgeCheck` in verified + "Verified certificate" (h-level none; the h1 is the course inside the object) and "Issued by {site.name} to {name} on {date}." Then the full `Certificate`.
- [ ] **Step 2: Actions** (client): "Download PDF" (primary link), "Copy link" (copies `siteUrl(/certificates/{serial})`, announces "Link copied"), "Share" (Web Share API when `navigator.share` exists, else hidden). All 44px.
- [ ] **Step 3: For employers** — h2 "What this certificate shows": "{name} finished every lesson and passed every quiz in {course}. The course was completed on {date}." and "Checked {today}. This page is the certificate's permanent record; if the number did not exist, this page would say so." — plain, no marketing.
- [ ] **Step 4: Not found** — h1 "No certificate with that number", one sentence, and the same verify form as `/certificates` with the typed number prefilled (read from the URL segment is not available in `not-found.tsx`, so the form starts empty).
- [ ] **Step 5: Commit** `Rebuild the certificate page around the certificate and what it proves`.

### Task 8: Auth pages

**Files:** Create `components/auth/password-input.tsx`, `components/auth/auth-layout.tsx`; modify the four pages and forms.

- [ ] **Step 1:** `AuthLayout({ title, lede, children, footer })`: `main` centered, `max-w-[25rem]`, `py-12 sm:py-16`, h1 32px, lede graphite; the form sits on `bg-surface border border-rule rounded-lg p-6`.
- [ ] **Step 2:** `PasswordInput` (client): the `Input` plus a 40px "Show password"/"Hide password" toggle button (`aria-pressed`, `aria-controls`), `autoComplete` passed through, paste never blocked.
- [ ] **Step 3:** Every form: errors rendered next to the field with `id`, the field gets `aria-invalid` and `aria-describedby`; on submit failure focus moves to the first invalid field (or the form error). "Forgot password?" is a 24px+ link (`inline-flex min-h-6`). Sign-in lede: "Sign in to continue learning."; sign-up: "Create your account" / "Learn at your own pace and get a certificate when you finish."
- [ ] **Step 4:** Keep `method="post"` on every form and `EmailDeliveryNote` where it is (unit tests read them).
- [ ] **Step 5: Commit** `Put sign-in, sign-up and password reset in one calm column with a show-password toggle`.

### Task 9: Checkout and cart

**Files:** Create `components/checkout/checkout-steps.tsx`; rewrite `bkash-quote.tsx`, `bkash-proof-form.tsx`, the checkout page and the cart page.

- [ ] **Step 1: Steps.** `<ol>` of three `<li><section aria-labelledby>`: "1 Review your order", "2 Pay with bKash", "3 Submit your transaction ID", each with a 28px ink number disc (a sequence, so numbers are information) and a heading.
- [ ] **Step 2: Review.** Lines (`title`, `Price` right), coupon form ("Coupon code", Plex Mono uppercase input, "Apply"), subtotal / discount / total as a `<dl>`.
- [ ] **Step 3: Pay.** "Send exactly" + the amount in 32px `Price`, then the bKash instructions (Send Money, the number or the "shared by the academy" copy).
- [ ] **Step 4: Submit.** "bKash transaction ID" (Plex Mono, `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="characters"`, hint "10 characters, from the bKash confirmation SMS"), "Your bKash number" (`type="tel"`, `inputMode="numeric"`, `autoComplete="tel"`), "Date of payment" (`type="date"`, defaults to today), "Reference (optional)". Primary "Submit transaction ID". The success state and the "awaiting verification" state use the `caution` alert: "Awaiting verification. We check transaction {Serial} and open the course; you get a notification." The e2e regex `/payment submitted|awaiting verification/i` still matches.
- [ ] **Step 5: Stripe** (only when configured and a USD price exists): a separate panel after the steps, "Or pay by card" with the USD `Price` and "Continue to Stripe".
- [ ] **Step 6: Cart.** Line list with Remove (ghost, 32px, `aria-label="Remove {title} from cart"`), owned/unpriced notes, free enrol button, then the same steps for the payable lines. Empty cart: "Your cart is empty." + "Browse courses".
- [ ] **Step 7:** e2e: "Submit payment for verification" → "Submit transaction ID" in `qa-admin.spec.ts`.
- [ ] **Step 8: Commit** `Show checkout as the three steps it is, with the transaction ID in Plex Mono`.

### Task 10: 404 and error, then checks

- [ ] **Step 1:** 404: h1 "Page not found", one sentence, a search form (GET `/courses`), "Browse courses" and "Go to the home page". Error: "Something went wrong", "Try again" (`retry`), "Go to the home page".
- [ ] **Step 2:** `npm run lint && npm run typecheck && npm run test`; `npm run db:test:prepare -- --fresh`; SQL suites; `npm run test:db:flows`; `npm run test:e2e`; `npm run build`.
- [ ] **Step 3:** `npm run ui-audit && npm run ui-audit:summary && npm run ui-audit:keyboard`. Public routes: 0 axe, 0 small targets, 0 text < 13px, 0 overflow. Screenshots of every public route at 1440 and 375 reviewed against spec §4 and §6.
- [ ] **Step 4:** Progress log row; commit; push.
