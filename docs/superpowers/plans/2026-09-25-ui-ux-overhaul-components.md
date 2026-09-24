# UI/UX overhaul, plan 3: core components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared pieces every page redesign in plans 4–6 is made of (spec §7): `price`, `status-badge`, `serial`, `cover-mark`, `course-row`, `course-module` and `certificate`. Swap them in wherever they drop into an existing page without redesigning it, and delete the grid `course-card`.

**Architecture:** Each component's decisions (how a price is written, which tone a status gets, which rows the compact module shows, which hue a category gets) live in small pure functions with unit tests (`lib/format.ts`, `lib/status.ts`, `lib/cover.ts`, `lib/course-module.ts`). The components are thin server components over them; only `Serial` (clipboard) is a client component. `course-module` grows out of plan 2's `CurriculumList` so the player, the landing page, the home page and the dashboard show a course's lessons the same way.

**Tech Stack:** React 19.2 server components, Tailwind v4 tokens, lucide-react, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-25-ui-ux-overhaul-design.md` §4 (colour meanings, type, radius, the certificate as the one special object), §6, §7. Plan 2 shipped `sheet`, `account-menu`, the shells and `CurriculumList`.

## Global Constraints

- Colour meanings are fixed: `verified` = completed, paid, verified, certificate; `seal` = certificate seal, destructive, errors; `caution` = pending only; `mark` = the learner's current position only. The certificate is the only thing with a hard edge (`rounded-[2px]`) and a solid offset shadow (`shadow-certificate`), the only place bottle green is a surface, the only place the red seal appears.
- Monospace (IBM Plex Mono) only for strings a person reads or types exactly: certificate numbers, bKash transaction IDs, coupon codes, order numbers.
- Taka written `৳5,990` (symbol, no "BDT", no `.00` on whole amounts); USD `$49`. Tabular numerals on prices, counts, durations.
- No ` · ` joins in JSX, no `→` in link text, no all-caps, no icon-in-tinted-square, no gradient covers.
- Targets ≥ 24×24; the whole course row is one link with a visible focus outline around the row.
- e2e asserts on prices, so the e2e money helper must call the same `formatPrice` the app uses.

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/format.ts`, `lib/format.test.ts` | modify | `formatPrice` → `৳5,990` / `$49` |
| `lib/courses.test.ts` | modify | price expectations follow the spec |
| `e2e/qa-learner.spec.ts` | modify | money helper imports `formatPrice` |
| `components/course/price.tsx` | create | tabular price, "Free", "Not for sale" |
| `lib/status.ts`, `lib/status.test.ts` | create | status → label + tone for course, order, payment, refund |
| `components/course/status-badge.tsx` | create | semantic badge |
| `components/site/status-badges.tsx` | delete | replaced |
| `components/course/serial.tsx` | create | Plex Mono string + copy button (client) |
| `lib/cover.ts`, `lib/cover.test.ts` | create | category → tint, title → initial |
| `components/course/cover-mark.tsx` | create | 48px generated cover |
| `components/course/course-row.tsx` | create | catalog/home list row |
| `components/site/course-card.tsx` | delete | replaced by the row |
| `lib/course-module.ts`, `lib/course-module.test.ts` | create | row states, compact window, gate detection |
| `components/course/course-module.tsx` | create (moves `components/learn/curriculum-list.tsx`) | `player`, `outline`, `compact` variants |
| `components/course/certificate.tsx` | create | `Certificate` (full, card), `CertificateChip`, `Seal` |
| pages that print prices, statuses, serials, course cards, curricula or the certificate | modify | drop-in swaps only |

---

### Task 1: Price

**Files:** Modify `lib/format.ts`, `lib/format.test.ts`, `lib/courses.test.ts`, `e2e/qa-learner.spec.ts`. Create `components/course/price.tsx`.

**Interfaces:** `formatPrice(amountMinor: number, currency: string): string` (unchanged signature). `Price({ amount, currency, className })`, `CoursePrice({ isFree, price, className })` (replaces `coursePriceLabel` rendering: "Free", the price, or "Not for sale").

- [ ] **Step 1: Failing test** in `lib/format.test.ts`:

```ts
describe("formatPrice", () => {
  it("writes taka with the symbol and no decimals on whole amounts", () => {
    expect(formatPrice(599000, "BDT")).toBe("৳5,990");
    expect(formatPrice(359100, "BDT")).toBe("৳3,591");
    expect(formatPrice(359150, "BDT")).toBe("৳3,591.50");
  });
  it("writes dollars as $49", () => {
    expect(formatPrice(4900, "USD")).toBe("$49");
    expect(formatPrice(0, "USD")).toBe("$0");
  });
});
```

- [ ] **Step 2: Implement**

```ts
export function formatPrice(amount: number, currency: string): string {
  // Amounts are integer minor units. Whole amounts drop ".00"; the symbol is
  // the narrow one (৳, $) as a course marketplace writes it.
  const whole = amount % 100 === 0;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
```

Update `lib/courses.test.ts` (`$49.00` → `$49`, `$0.00` → `$0`). In `e2e/qa-learner.spec.ts` replace the local `formatMoney` with `import { formatPrice } from "../lib/format"` so the spec and the app cannot disagree.

- [ ] **Step 3: `Price`**

```tsx
export function Price({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
  return <span className={cn("whitespace-nowrap tabular-nums", className)}>{formatPrice(amount, currency)}</span>;
}

export function CoursePrice({ isFree, price, className }: {
  isFree: boolean; price: { amount: number; currency: string } | null; className?: string;
}) {
  if (isFree) return <span className={cn("font-semibold text-verified", className)}>Free</span>;
  if (!price) return <span className={cn("text-graphite", className)}>Not for sale</span>;
  return <Price amount={price.amount} currency={price.currency} className={cn("font-semibold", className)} />;
}
```

"Free" in verified green reads as "no payment needed", which is the colour's meaning (paid/verified); it is text, 4.5:1 on white is proven in `design-tokens.test.ts`.

- [ ] **Step 4:** `npx vitest run lib/format.test.ts lib/courses.test.ts`, then check `৳` in a 1440 screenshot of `/courses/sql-for-analysts/checkout` at 15, 20 and 32px. If it renders as tofu or sits visibly off the baseline, note it in the progress log (the fallback plan is `Tk 5,990`, spec §13).
- [ ] **Step 5: Commit** `Write prices as ৳5,990 and $49 through one Price component`.

---

### Task 2: Status badge

**Files:** Create `lib/status.ts`, `lib/status.test.ts`, `components/course/status-badge.tsx`. Delete `components/site/status-badges.tsx` and update its importers.

**Interfaces:**

```ts
export type StatusKind = "course" | "order" | "payment" | "refund";
export type StatusTone = "verified" | "caution" | "seal" | "neutral";
export function statusTone(kind: StatusKind, status: string): StatusTone;
export function statusLabel(kind: StatusKind, status: string): string;
```

| kind | status → label (tone) |
|---|---|
| course | DRAFT Draft (caution), IN_REVIEW In review (caution), PUBLISHED Published (verified), UNPUBLISHED Unpublished (neutral) |
| order | PENDING Awaiting payment (caution), PAID Paid (verified), FAILED Failed (seal), REFUNDED Refunded (neutral), PARTIALLY_REFUNDED Partly refunded (neutral) |
| payment | PENDING Not submitted (neutral), PENDING_VERIFICATION Awaiting verification (caution), COMPLETED Paid (verified), FAILED Rejected (seal), REFUNDED Refunded (neutral) |
| refund | REQUESTED Requested (caution), APPROVED Approved (caution), REJECTED Rejected (seal), PROCESSED Refunded (neutral) |

Unknown values: sentence-cased from the enum, neutral.

- [ ] **Step 1:** Tests: every row of the table; unknown `SOMETHING_ELSE` → "Something else", neutral.
- [ ] **Step 2:** Implement with one `Record<StatusKind, Record<string, [label, tone]>>`.
- [ ] **Step 3:** `StatusBadge({ kind, status })` renders `<Badge variant>` with `success` (verified), `warning` (caution), `destructive` (seal), `outline` (neutral: graphite text, rule border). Text only; no dots.
- [ ] **Step 4:** Replace `CourseStatusBadge`/`OrderStatusBadge` call sites (`grep -rn "StatusBadge" app components`), delete the old file.
- [ ] **Step 5: Commit** `Give every status one badge with the colour it means`.

---

### Task 3: Serial

**Files:** Create `components/course/serial.tsx`.

**Interfaces:** `Serial({ value, copyLabel, size = "md" | "sm" | "lg", className })` (client). `copyLabel` names the thing ("certificate number", "transaction ID", "order number"); omitted → no copy button.

- [ ] **Step 1: Implement**

- `<code className="font-mono font-medium tracking-normal break-all">` (`text-sm` / `text-base` / `text-lg`).
- Copy button: `Button variant="ghost" size="icon-sm"` (32px), `aria-label={\`Copy ${copyLabel}\`}`, `Copy` icon → `Check` icon for 2s after copying. A visually hidden `role="status"` span says "Copied" (announced once).
- `navigator.clipboard.writeText` inside try/catch; on failure the status says "Could not copy. Select the text instead." (the text stays selectable, `select-all`).

- [ ] **Step 2:** Use it where serials, transaction IDs and order numbers are shown today: certificate page, order receipt, admin payments (read-only, no copy there), cart/checkout coupon echo stays as text. `grep -rn "font-mono" app components` lists the current spots.
- [ ] **Step 3: Commit** `Show serials, transaction IDs and order numbers in Plex Mono with a copy button`.

---

### Task 4: Cover mark and course row

**Files:** Create `lib/cover.ts`, `lib/cover.test.ts`, `components/course/cover-mark.tsx`, `components/course/course-row.tsx`. Modify `app/(site)/courses/page.tsx`, `app/(site)/page.tsx`. Delete `components/site/course-card.tsx`.

**Interfaces:**

```ts
export const COVER_TINTS: readonly { bg: `#${string}`; name: string }[];
export function coverTint(key: string): (typeof COVER_TINTS)[number]; // stable FNV hash of the category slug
export function coverInitial(title: string): string; // first letter or digit, uppercased
export type CourseRowData = {
  title: string; slug: string; subtitle: string | null; level: string;
  ratingAverage: number; ratingCount: number;
  instructor: { name: string }; primaryCategory: { name: string; slug: string } | null;
  totalDuration: string; lectureCount: number;
  price: { amount: number; currency: string } | null; isFree: boolean;
};
```

Six tints, all light, all with `ink` initials (contrast proven in the test), none of them the highlighter yellow, the caution sand, or a green that could read as "verified": blue `#e6eaf6`, lilac `#eee8f4`, sky `#e3eff5`, clay `#f4e8e2`, olive `#ecefdf`, slate `#e9ebef`.

- [ ] **Step 1: Tests** — `coverTint` is stable for a key and always from the set; different keys spread over at least 4 tints for the 6 seed categories; `contrastRatio(ink, tint) ≥ 4.5` for every tint; `coverInitial("  python basics")` = "P", `coverInitial("3D modelling")` = "3", `coverInitial("")` = "?".
- [ ] **Step 2: CoverMark** — `size` 40 | 48 | 64; `rounded-md border border-rule`, background from the tint (inline style), initial 20/24/30px weight 700, `aria-hidden` (the title is the name).
- [ ] **Step 3: CourseRow** (server):

```tsx
<article className="relative flex gap-4 py-5 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ink has-[a:focus-visible]:outline-offset-2 rounded-sm">
  <CoverMark title={course.title} categoryKey={course.primaryCategory?.slug ?? course.slug} />
  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:gap-6">
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <h3 className="text-base font-semibold leading-snug">
        <Link href={`/courses/${slug}`} className="outline-none after:absolute after:inset-0 hover:underline">{title}</Link>
      </h3>
      {subtitle ? <p className="line-clamp-1 text-sm text-graphite">{subtitle}</p> : null}
      <p className="text-sm text-ink">{instructor.name}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite">
        {rating ? <li><CompactRating …/></li> : null}
        <li>{lectureCount} lessons</li><li>{totalDuration}</li><li>{levelLabel}</li>
      </ul>
    </div>
    <CoursePrice className="text-base sm:text-right" … />
  </div>
</article>
```

The meta is a list of separate items (no middle dots). The row's link covers the whole row (`after:inset-0`); the row draws the focus outline (`has-[a:focus-visible]`) so the focus indicator surrounds what you would click.

- [ ] **Step 4: Swap the grid for rows** on `/courses` and the home page's course list (`<ul className="divide-y divide-rule">` of `<li><CourseRow/></li>`). Page layout otherwise unchanged (plan 4 redesigns both). Delete `course-card.tsx`.
- [ ] **Step 5: Verify** — `/courses` at 375: each row ~120px; 6 rows well under the 3,000px budget. Keyboard: Tab lands on each row with the outline around the row.
- [ ] **Step 6: Commit** `Replace course cards with list rows and a generated cover mark`.

---

### Task 5: Course module

**Files:** Create `lib/course-module.ts`, `lib/course-module.test.ts`, `components/course/course-module.tsx`. Delete `components/learn/curriculum-list.tsx`; update `components/learn/learn-shell.tsx`. Modify the landing page's curriculum section (`app/(site)/courses/[slug]/page.tsx`) to use the `outline` variant.

**Interfaces:**

```ts
// lib/course-module.ts
export type ModuleRow = {
  id: string; title: string; type: string; isPreview: boolean;
  durationSeconds: number | null; completed?: boolean; locked?: boolean;
};
export type ModuleSection = { id: string; title: string; items: ModuleRow[] };
export type RowState = "current" | "done" | "open" | "locked";
export function rowState(row: ModuleRow, currentId: string | null): RowState;
export function isGate(rows: ModuleRow[], index: number): boolean; // an unpassed, open quiz with locked rows after it
export function compactWindow(sections: ModuleSection[], currentId: string, size?: number):
  { section: ModuleSection; sectionIndex: number; rows: ModuleRow[] } | null;
export function sectionMinutes(section: ModuleSection): number;
```

`compactWindow` returns the current row's section, trimmed to `size` rows (default 4) with the current row kept and at most one done row before it.

```tsx
// components/course/course-module.tsx
export function CourseModule(props:
  | { variant: "player"; sections: ModuleSection[]; slug: string; currentId: string; idPrefix?: string }
  | { variant: "outline"; sections: ModuleSection[]; slug: string; openFirst?: boolean }
  | { variant: "compact"; sections: ModuleSection[]; currentId: string; headingLevel?: 2 | 3 }
): JSX.Element;
```

- [ ] **Step 1: Tests** — `rowState` precedence (current beats locked/done); `isGate` true only for an open, unpassed quiz followed by a locked row; `compactWindow` keeps the current row, never crosses sections, returns null for an unknown id; `sectionMinutes` sums lecture durations.
- [ ] **Step 2: `player`** — plan 2's `CurriculumList` markup, reading `rowState`/`isGate` from the lib. `data-state` and the `nav aria-label="Curriculum"` stay (e2e uses them).
- [ ] **Step 3: `outline`** (landing page) — one `<details>` per section (native disclosure: keyboard and screen-reader support without JS), `open` on the first; the `<summary>` is a 48px row with the section title, "{n} lessons, {m} min" and a chevron that rotates. Rows: type icon (lecture `PlayCircle`, article `FileText`, quiz `FileQuestion`), title, and for previews a "Preview" link named `Preview: {title}` (the landing e2e depends on the name), duration right-aligned. When `completed`/`locked` are present (an enrolled learner) the done tick shows.
- [ ] **Step 4: `compact`** (home "Continue learning", dashboard "Continue") — the section title as a small heading, then the window rows: done rows with the verified tick, the current row on the `mark` band with "Up next" in sr-only, following rows graphite. No links inside (the card's Resume button is the action).
- [ ] **Step 5:** Swap the learn shell to `CourseModule variant="player"` and the landing page's curriculum to `variant="outline"`. Delete `curriculum-list.tsx`.
- [ ] **Step 6: Commit** `Share one course module between the player, the landing page and the dashboard`.

---

### Task 6: Certificate

**Files:** Create `components/course/certificate.tsx`. Modify `app/(site)/certificates/[serial]/page.tsx` (use `Certificate size="full"` in place of the current bordered article; the page's surrounding layout is redesigned in plan 4), the player's completion banner (plan 2's page; `size="card"` is used by plan 5's banner, this task only wires the chip), `app/(site)/dashboard/page.tsx` completed rows (`CertificateChip`).

**Interfaces:**

```tsx
export function Certificate(props: {
  size: "full" | "card";
  siteName: string;
  recipient: string;
  course: string;
  issuedAt: Date;
  serial: string;
  /** Full size on its own page: the course title is the page's h1. */
  courseHeadingLevel?: 1 | 2 | 3 | "p";
}): JSX.Element;
export function CertificateChip(props: { serial: string; className?: string }): JSX.Element;
export function Seal(props: { size?: number }): JSX.Element;
```

- [ ] **Step 1: Seal** — inline SVG, `aria-hidden`: a `seal` red disc, a thin white inner ring, a white check in the middle, 64px (full) / 44px (card). The only red disc in the product.
- [ ] **Step 2: Certificate**

```
<figure class="rounded-[2px] border border-verified bg-surface shadow-certificate">
  <div class="flex items-center justify-between gap-4 bg-verified px-6 py-3 text-white">   ← green as a surface, only here
    <span class="font-bold">{siteName}</span><span class="text-sm">Certificate of completion</span>
  </div>
  <div class="flex flex-col gap-2 px-6 py-8 sm:px-10 sm:py-10">
    <p class="text-sm text-graphite">This certifies that</p>
    <p class="text-3xl font-bold sm:text-4xl">{recipient}</p>
    <p class="mt-3 text-sm text-graphite">completed the online course</p>
    <Heading class="text-2xl font-semibold">{course}</Heading>
    <div class="mt-8 flex items-end justify-between gap-6 border-t border-rule pt-5">
      <dl class="grid gap-3 sm:grid-cols-2 sm:gap-8">
        <div><dt class="text-xs text-graphite">Issued</dt><dd><time>{date}</time></dd></div>
        <div><dt class="text-xs text-graphite">Certificate number</dt><dd class="font-mono">{serial}</dd></div>
      </dl>
      <Seal/>
    </div>
  </div>
</figure>
```

`card` scales everything down (recipient 24px, course 18px, padding 20px, shadow `6px 6px 0` via a `shadow-certificate-sm` utility) for the home page sample and the completion moment. Print: the green band and the shadow keep (`print-color-adjust: exact`).

- [ ] **Step 3: CertificateChip** — `Link` to `/certificates/{serial}`: `inline-flex min-h-8 items-center gap-2 rounded-[2px] border border-verified px-2.5 text-sm text-ink hover:bg-wash`, an `Award` icon in verified, visible text "View certificate", and the serial in 13px Plex Mono after it (hidden below `sm`). Accessible name starts with "View certificate" (dashboard e2e).
- [ ] **Step 4:** Certificate page uses `Certificate size="full" courseHeadingLevel={1}` (the e2e looks for the course as a heading and "This certifies that"); dashboard completed rows use `CertificateChip`.
- [ ] **Step 5: Commit** `Draw the certificate as the one special object: green band, seal, hard shadow`.

---

### Task 7: Checks

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm run test` (new unit tests for format, status, cover, course-module).
- [ ] **Step 2:** `npm run db:test:prepare -- --fresh`, SQL suites, `npm run test:db:flows`, `npm run test:e2e`, `npm run build`.
- [ ] **Step 3:** `npm run ui-audit && npm run ui-audit:summary`. Expect: no new axe rules; catalog/home row links ≥ 24px; certificate page clean.
- [ ] **Step 4:** Screenshots at 1440 and 375 of `/courses`, `/courses/typescript-foundations`, the certificate page, the dashboard's Completed tab. Check against spec §4: one special object, colours mean one thing each.
- [ ] **Step 5:** Progress log row; commit; push.

## After this plan

Plan 4 redesigns the public pages around these components (home, catalog toolbar and filters sheet, landing page layout and purchase panel, certificate page, auth, checkout, cart, 404).
