# UI/UX overhaul, plan 2: shells

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every route renders in the shell the spec gives it (§5): the **site** shell (top bar with one account menu, slim state-aware footer), the **learn** focus shell (own top bar, curriculum rail on desktop, "Contents" sheet on phones, no marketing chrome) and the **app** shell (240px sidebar for studio and admin). URLs do not change.

**Architecture:** The root layout keeps only `<html>`, fonts and globals. Three route groups carry the chrome: `app/(site)/layout.tsx`, `app/(learn)/layout.tsx`, `app/(app)/layout.tsx`. Route groups do not add URL segments, so the build's route list must be identical before and after. The site header is a server component that decides roles and counts; its interactive parts (account menu, phone sheet) are client components that receive plain props. The learn shell is a component the player page renders (a layout cannot see the current item), and the app shell is the `(app)` layout. A `Sheet` primitive on Radix Dialog serves the phone menu, the phone curriculum and the phone app sidebar.

**Tech Stack:** Next.js 16.3 App Router (route groups, layouts, `not-found.tsx`), React 19.2, Tailwind v4 tokens from plan 1, `radix-ui` 1.6 (Dialog, DropdownMenu), lucide-react, Vitest 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-25-ui-ux-overhaul-design.md` §5 (shells), §8 (accessibility). Plan 1: `docs/superpowers/plans/2026-09-25-ui-ux-overhaul-foundation.md`.

## Global Constraints

- Read before writing: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`, `layout.md`, `not-found.md`, `error.md` (Next 16.3: the error boundary's prop is `retry`, not `reset`).
- Route groups must not change URLs. Capture the build's route list before Task 2 and diff it after.
- A root `not-found.tsx` renders inside the **root** layout only (not inside a group layout), so it must draw its own site chrome. `notFound()` thrown in a grouped page bubbles to the closest `not-found.tsx`.
- Colours only from tokens (`ink`, `graphite`, `rule`, `control`, `wash`, `mark`, `verified`, `seal`, `caution`). `mark` is **only** "you are here" in learning (the current lesson row). The app sidebar's active item is a left ink bar, not the highlighter.
- Targets ≥ 24×24 everywhere, top-bar controls ≥ 44px tall; one focus style (`focus-ring`); sticky bars must not cover focused elements (`scroll-padding-top`).
- Sheets: Radix Dialog (focus trap, Esc, focus return), `overscroll-behavior: contain`, a visible title or `sr-only` title.
- Public copy reads like a course marketplace. No `→` in link text, no ` · ` joins, no all-caps.
- `npm run db:migrate` only; this plan changes no schema.
- Commit on `claude/ui-ux-overhaul` per task; push at the end of the plan. Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `playwright.config.ts`, `scripts/ui-audit/audit.mjs`, `scripts/ui-audit/keyboard.mjs`, `.env.example` | modify | optional `PLAYWRIGHT_CHROMIUM_PATH` for machines whose pre-installed Chromium does not match Playwright's revision |
| `app/(site)/…` | move | `page.tsx`, `courses`, `cart`, `certificates`, `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `dashboard`, `account`, `orders`, `notifications` |
| `app/(learn)/learn/…` | move | `learn` |
| `app/(app)/studio/…`, `app/(app)/admin/…` | move | `studio`, `admin` |
| `app/layout.tsx` | modify | html, body, fonts, `MotionProvider`; no chrome |
| `app/(site)/layout.tsx` | create | `SiteChrome` |
| `app/(site)/error.tsx` | create | error UI inside the site chrome |
| `app/not-found.tsx`, `app/error.tsx` | modify | root 404 draws `SiteChrome`; root error stays chrome-less (learn/app areas) |
| `components/site/site-chrome.tsx` | create | skip link, header, `#main`, footer |
| `components/ui/sheet.tsx` | create | drawer on Radix Dialog |
| `lib/nav.ts` + `lib/nav.test.ts` | create | which links each visitor gets (pure), initials |
| `lib/certificate-serial.ts` + `.test.ts` | create | normalise a typed serial (pure) |
| `lib/site.ts` | modify | optional `supportEmail` (`SUPPORT_EMAIL`) |
| `components/site/header.tsx` | rewrite | server: session, roles, counts → `SiteHeaderBar` |
| `components/site/site-header-bar.tsx` | create | client: desktop nav + actions, phone sheet |
| `components/site/account-menu.tsx` | create | initials avatar dropdown |
| `components/site/header-nav.tsx`, `components/site/notifications-menu.tsx` | delete | replaced |
| `components/site/footer.tsx` | modify | adds Verify a certificate and Help |
| `app/(site)/certificates/page.tsx` | create | "Verify a certificate" form |
| `app/(site)/help/page.tsx` | create | help page (3.2.6 consistent help) |
| `app/(learn)/layout.tsx` | create | focus canvas, no site chrome |
| `components/learn/learn-shell.tsx`, `learn-top-bar.tsx`, `learn-rail.tsx`, `curriculum-list.tsx`, `curriculum-sheet.tsx` | create | the focus shell |
| `app/(learn)/learn/[slug]/[itemId]/page.tsx` | modify | renders inside `LearnShell` |
| `app/(app)/layout.tsx` | create | staff guard + `AppShell` |
| `components/app/app-shell.tsx`, `app-sidebar.tsx` | create | sidebar, phone top bar + sheet |
| `app/(app)/studio/layout.tsx`, `app/(app)/admin/layout.tsx` | modify | guards only |
| `app/(app)/studio/studio-nav.tsx`, `app/(app)/admin/admin-nav.tsx` | delete | replaced by the sidebar |
| `tests/integration/*.test.ts` | modify | `@/app/…` import paths |
| `e2e/*.spec.ts` | modify | shell selectors |

---

### Task 1: Chromium path override

**Files:** Modify `playwright.config.ts`, `scripts/ui-audit/audit.mjs`, `scripts/ui-audit/keyboard.mjs`, `.env.example`.

Playwright 1.62 expects Chromium revision 1234. A machine can have a different revision installed and no network to download one. `PLAYWRIGHT_CHROMIUM_PATH` points every launcher at an existing binary. Empty means Playwright's own.

- [ ] **Step 1:** In `playwright.config.ts` add to `use`:

```ts
    // Optional: a Chromium binary to use instead of Playwright's download.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
```

- [ ] **Step 2:** In `audit.mjs` and `keyboard.mjs` replace `chromium.launch()` with
  `chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {})`. Both already load `.env` through `ids.mjs`.
- [ ] **Step 3:** `.env.example`, under "Tests (optional)": `PLAYWRIGHT_CHROMIUM_PATH=""` with a one-line comment.
- [ ] **Step 4:** Verify `ONLY=home npm run ui-audit` launches. Commit: `Let e2e and the audit use a pre-installed Chromium`.

---

### Task 2: Route groups (files move, URLs stay)

**Files:** Move the directories in the file map with `git mv`. Modify `app/layout.tsx`, `app/not-found.tsx`, the test imports and the one cross-route import. Create `app/(site)/layout.tsx`, `app/(site)/error.tsx`, `components/site/site-chrome.tsx`, and temporary pass-through `app/(learn)/layout.tsx` and `app/(app)/layout.tsx` (Tasks 5 and 6 replace them).

**Interfaces:** Produces `SiteChrome({ children })` (server component: skip link → `SiteHeader` → `<div id="main" tabIndex={-1}>` → `SiteFooter`).

- [ ] **Step 1: Record the route list**

Run: `npm run build 2>&1 | sed -n '/^Route (app)/,/^$/p' > /tmp/routes-before.txt` (36 routes).

- [ ] **Step 2: Move**

```bash
mkdir -p "app/(site)" "app/(learn)" "app/(app)"
for d in page.tsx courses cart certificates sign-in sign-up forgot-password reset-password dashboard account orders notifications; do git mv "app/$d" "app/(site)/$d"; done
git mv app/learn "app/(learn)/learn"
git mv app/studio "app/(app)/studio"
git mv app/admin "app/(app)/admin"
```

- [ ] **Step 3: Chrome moves out of the root layout**

`components/site/site-chrome.tsx`:

```tsx
import type { ReactNode } from "react";
import { SiteFooter } from "./footer";
import { SiteHeader } from "./header";

/** Top bar, page, slim footer. Used by the (site) layout and the root 404. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <SiteHeader />
      <div id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        {children}
      </div>
      <SiteFooter />
    </>
  );
}
```

Add a `skip-link` utility to `globals.css` (sr-only until focused, then a fixed ink pill at top-left, `z-[60]`), so all three shells share one skip link style. The header no longer renders its own skip link.

`app/layout.tsx` body becomes `<MotionProvider>{children}</MotionProvider>` inside `<body className="flex min-h-dvh min-w-0 flex-col overflow-x-clip font-sans">`. `app/(site)/layout.tsx` returns `<SiteChrome>{children}</SiteChrome>`.

`app/not-found.tsx` wraps its `<main>` in `<SiteChrome>` (unmatched URLs render in the root layout only). `app/(site)/error.tsx` is the current `app/error.tsx` content (client component, `retry`). The root `app/error.tsx` stays as the fallback for the learn and app areas; give it a wordmark link above the heading, since it has no chrome.

- [ ] **Step 4: Temporary pass-through layouts**

`app/(learn)/layout.tsx` and `app/(app)/layout.tsx`: return `<SiteChrome>{children}</SiteChrome>` for now, so the move alone changes nothing visible. Tasks 5 and 6 replace both.

- [ ] **Step 5: Fix imports**

- `app/(site)/courses/[slug]/page.tsx`: `@/app/cart/actions` → `@/app/(site)/cart/actions`.
- `tests/integration/*.test.ts`: `@/app/cart/` → `@/app/(site)/cart/`, `@/app/courses/` → `@/app/(site)/courses/`, `@/app/certificates/` → `@/app/(site)/certificates/`, `@/app/studio/` → `@/app/(app)/studio/`, `@/app/admin/` → `@/app/(app)/admin/`, `@/app/learn/` → `@/app/(learn)/learn/`.
- `grep -rn '"@/app/' app components lib tests e2e scripts` must show only grouped paths.

- [ ] **Step 6: Verify URLs unchanged**

Run: `npm run typecheck && npm run build 2>&1 | sed -n '/^Route (app)/,/^$/p' > /tmp/routes-after.txt && diff /tmp/routes-before.txt /tmp/routes-after.txt`
Expected: no diff. Then `npm run test:db:flows` (the moved action imports) is green.

- [ ] **Step 7: Commit** `Move routes into site, learn and app groups without changing URLs`.

---

### Task 3: Sheet

**Files:** Create `components/ui/sheet.tsx`.

**Interfaces:** Produces `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent({ side?: "left" | "right" | "bottom", title: string, titleHidden?: boolean, description?: string })`. `side` defaults to `"right"`.

- [ ] **Step 1: Implement on Radix Dialog**

```tsx
"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

const SIDES = {
  left: "inset-y-0 left-0 h-dvh w-[min(20rem,calc(100vw-3rem))] border-r data-[state=open]:slide-in-from-left",
  right: "inset-y-0 right-0 h-dvh w-[min(20rem,calc(100vw-3rem))] border-l data-[state=open]:slide-in-from-right",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg border-t data-[state=open]:slide-in-from-bottom",
} as const;

function SheetContent({
  side = "right",
  title,
  titleHidden = false,
  description,
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof SIDES;
  title: string;
  titleHidden?: boolean;
  description?: string;
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border-rule bg-surface shadow-md outline-none overscroll-contain",
          "data-[state=open]:animate-in data-[state=open]:duration-200",
          SIDES[side],
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className="flex min-h-14 items-center justify-between gap-2 border-b border-rule px-4">
          <SheetPrimitive.Title className={cn("text-base font-semibold", titleHidden && "sr-only")}>
            {title}
          </SheetPrimitive.Title>
          <SheetPrimitive.Close className="ml-auto inline-flex size-11 items-center justify-center rounded-md text-ink hover:bg-wash focus-ring">
            <XIcon className="size-5" aria-hidden />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        </div>
        {description ? (
          <SheetPrimitive.Description className="sr-only">{description}</SheetPrimitive.Description>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetTrigger };
```

Radix traps focus, closes on Esc and outside click, and returns focus to the trigger. Motion is an open-only slide (transform), which the global reduced-motion rule shortens to nothing.

- [ ] **Step 2: Verify** with the phone header in Task 4 (keyboard: Tab stays inside, Esc closes, focus returns to "Menu"). Commit with Task 4.

---

### Task 4: Site top bar, account menu, footer, and the two pages they link to

**Files:** Create `lib/nav.ts`, `lib/nav.test.ts`, `lib/certificate-serial.ts`, `lib/certificate-serial.test.ts`, `components/site/site-header-bar.tsx`, `components/site/account-menu.tsx`, `app/(site)/certificates/page.tsx`, `app/(site)/help/page.tsx`. Rewrite `components/site/header.tsx`. Modify `components/site/footer.tsx`, `lib/site.ts`, `components/ui/dropdown-menu.tsx` (focus outline on items). Delete `components/site/header-nav.tsx`, `components/site/notifications-menu.tsx`.

**Interfaces:**
- `lib/nav.ts` produces:

```ts
export type NavLink = { href: string; label: string };
export type Viewer = { signedIn: boolean; roles: readonly string[] };
export const PRIMARY_NAV: NavLink[]; // Courses, Verify a certificate
export function accountLinks(viewer: Viewer): NavLink[]; // Account, Orders, [Studio], [Admin], Help
export function footerLinks(viewer: Viewer): NavLink[];
export function initials(name: string, email: string): string;
export function isActivePath(href: string, pathname: string): boolean;
```

- `lib/certificate-serial.ts` produces `normalizeSerial(raw: string, prefix: string): string | null` — trims, uppercases, drops spaces; accepts `GM360-1A2B-…` or the 16 hex characters alone (then formats them with the prefix); `null` when it cannot be a serial.

- [ ] **Step 1: Failing tests**

`lib/nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { accountLinks, footerLinks, initials, isActivePath, PRIMARY_NAV } from "./nav";

const labels = (links: { label: string }[]) => links.map((l) => l.label);

describe("site navigation", () => {
  it("offers courses and certificate checks to everyone", () => {
    expect(labels(PRIMARY_NAV)).toEqual(["Courses", "Verify a certificate"]);
  });

  it("puts studio and admin in the account menu by role only", () => {
    expect(labels(accountLinks({ signedIn: true, roles: ["LEARNER"] }))).toEqual(["Account", "Orders", "Help"]);
    expect(labels(accountLinks({ signedIn: true, roles: ["LEARNER", "INSTRUCTOR"] }))).toContain("Studio");
    expect(labels(accountLinks({ signedIn: true, roles: ["LEARNER", "INSTRUCTOR"] }))).not.toContain("Admin");
    expect(labels(accountLinks({ signedIn: true, roles: ["ADMIN"] }))).toEqual(
      expect.arrayContaining(["Studio", "Admin"]),
    );
  });

  it("never offers sign-in to someone signed in, in the footer", () => {
    const signedIn = labels(footerLinks({ signedIn: true, roles: [] }));
    expect(signedIn).not.toContain("Sign in");
    expect(signedIn).toEqual(expect.arrayContaining(["My learning", "Orders", "Help"]));
    expect(labels(footerLinks({ signedIn: false, roles: [] }))).toEqual(
      expect.arrayContaining(["Sign in", "Create account", "Help"]),
    );
  });

  it("makes initials from the name, falling back to the email", () => {
    expect(initials("Sam Learner", "learner@example.com")).toBe("SL");
    expect(initials("  nusrat  ", "n@example.com")).toBe("N");
    expect(initials("", "farhana.akter@example.com")).toBe("F");
  });

  it("marks a section active for its own sub-pages only", () => {
    expect(isActivePath("/courses", "/courses/sql-for-analysts")).toBe(true);
    expect(isActivePath("/courses", "/coursesx")).toBe(false);
    expect(isActivePath("/", "/courses")).toBe(false);
  });
});
```

`lib/certificate-serial.test.ts`: accepts `gm360-1a2b-3c4d-5e6f-7a8b` → `GM360-1A2B-3C4D-5E6F-7A8B`; accepts `1A2B 3C4D 5E6F 7A8B` → the same; accepts a URL pasted from a share (`https://…/certificates/GM360-…`) → the serial; rejects `hello`, `''`, and a serial with a foreign prefix of the wrong shape.

- [ ] **Step 2: Watch them fail**, then implement both modules. Studio shows for `INSTRUCTOR` or `ADMIN` (`/studio` admits both); Admin for `ADMIN`.
- [ ] **Step 3: Account menu (client)**

`components/site/account-menu.tsx`: `AccountMenu({ name, email, links, align = "end", side = "bottom" })`. Trigger: a 44px ghost button holding a 32px ink circle with `initials()` in white 13px/600, `aria-label="Account menu for {name}"`. Content: a label block (name 15/600, email 13 graphite, `break-all`), separator, one `DropdownMenuItem asChild` per link (`<Link>`), separator, "Sign out" item that calls `signOut()` then `router.push("/")` and `router.refresh()`. Items are ≥ 40px tall.

`components/ui/dropdown-menu.tsx`: items get a visible keyboard focus, not just a wash fill (1.1:1 against white is not visible): add `data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-ink`.

- [ ] **Step 4: Header**

`components/site/header.tsx` (server) reads `getCurrentUser()`, `getUserRoles()`, `cartItemCount()`, `unreadNotificationCount()` and renders `<SiteHeaderBar viewer={{ signedIn, roles }} user={{ name, email } | null} cartCount unreadCount accountLinks={accountLinks(viewer)} />`. Roles are decided on the server only.

`components/site/site-header-bar.tsx` (client, `usePathname` for `aria-current`):

- `<header className="sticky top-0 z-40 border-b border-rule bg-surface">` with an inner `max-w-6xl` row, `h-16`.
- Wordmark: `<Link href="/">` text only, 18px/700 ink.
- `md:` and up: `<nav aria-label="Main">` with `PRIMARY_NAV` (15px/500, graphite → ink when active; active also gets a 2px ink underline, `aria-current="page"`).
- Right, signed out (md+): "Sign in" (ghost, 44px) and "Create account" (primary, 44px).
- Right, signed in (md+): "My learning" (ghost, active on `/dashboard` and `/learn`), cart icon button (44px, `aria-label` "Cart, 2 items"), bell icon button (44px, "Notifications, 3 unread"), `AccountMenu`. Count badges: `min-w-5 h-5 rounded-full bg-ink text-white text-xs tabular-nums`, `aria-hidden` (the count is in the label).
- Below md: cart icon (signed in) and a "Menu" button (44px, icon + visible word "Menu", label includes unread count). The button opens `SheetContent side="right" title="Menu"` with, in order: `PRIMARY_NAV`; signed in: My learning, Notifications (with count), Cart, then `accountLinks`, then Sign out; signed out: Sign in, Create account (primary), Help. Every row is a 48px link. Selecting a link closes the sheet (`SheetClose asChild`).

- [ ] **Step 5: Footer**

`footerLinks(viewer)`: Courses, Verify a certificate, then signed in → My learning, Orders; signed out → Sign in, Create account; Help last. Links are 24px+ tall. The © line stays. Footer copy stays as-is otherwise.

- [ ] **Step 6: Verify a certificate page**

`app/(site)/certificates/page.tsx` (`metadata.title = "Verify a certificate"`, description "Check that a GlobalMentor360 certificate is genuine…" read from `getSite()`): if `searchParams.serial` normalises, `redirect(`/certificates/${serial}`)`; if it is present but invalid, show an inline error. The page: h1 "Verify a certificate", one sentence ("Enter the certificate number printed on the certificate or in its link."), a GET form with a labelled input (`name="serial"`, `autoComplete="off"`, `spellCheck={false}`, `font-mono`, `aria-describedby` for the hint and the error), and a "Check certificate" primary button.

- [ ] **Step 7: Help page**

`app/(site)/help/page.tsx`: h1 "Help", then short sections answering real questions from how the product works (paying with bKash and what happens after you submit the transaction ID; where your courses are; how lessons unlock in order; getting and sharing your certificate; resetting your password; card payments where offered). Contact: if `getSite().supportEmail` is set, a `mailto:` link; otherwise point to the course Q&A for course questions. No invented policies or timelines. `lib/site.ts`: add `supportEmail: string | null` from `process.env.SUPPORT_EMAIL || null`, and `SUPPORT_EMAIL=""` in `.env.example`.

- [ ] **Step 8: Verify**

Run: `npx vitest run lib/nav.test.ts lib/certificate-serial.test.ts && npm run lint && npm run typecheck`.
In the browser at 1440 and 375, signed out and as each seed account: one account menu, no duplicate Account link in the bar, the sheet traps focus and returns it to "Menu", Esc closes both the menu and the sheet, the footer never offers Sign in when signed in. `/certificates?serial=<the learner's serial in lower case>` lands on the certificate page.

- [ ] **Step 9: Commit** `Rebuild the site top bar around one account menu and add a phone menu sheet`.

---

### Task 5: Learn focus shell

**Files:** Replace `app/(learn)/layout.tsx`. Create `components/learn/learn-shell.tsx`, `learn-top-bar.tsx`, `learn-rail.tsx`, `curriculum-list.tsx`, `curriculum-sheet.tsx`. Modify `app/(learn)/learn/[slug]/[itemId]/page.tsx`.

**Interfaces:**

```ts
// components/learn/curriculum-list.tsx
export type CurriculumRow = {
  id: string; title: string; type: string; isPreview: boolean;
  locked: boolean; completed: boolean; durationSeconds: number | null;
};
export type CurriculumSection = { id: string; title: string; items: CurriculumRow[] };
export function CurriculumList(props: {
  sections: CurriculumSection[]; slug: string; currentId: string; onNavigate?: () => void;
}): JSX.Element;

// components/learn/learn-shell.tsx
export function LearnShell(props: {
  course: { title: string; slug: string; enrolled: boolean; percent: number;
            done: number; total: number; sections: CurriculumSection[] };
  currentId: string;
  next: { href: string; title: string } | null; // only when the next item is open
  children: React.ReactNode;
}): JSX.Element;
```

- [ ] **Step 1: Layout**

`app/(learn)/layout.tsx`: `return <div className="flex min-h-dvh min-w-0 flex-col bg-paper">{children}</div>;` — no site header, no footer.

- [ ] **Step 2: Curriculum list (server-renderable)**

One `<nav aria-label="Curriculum">`. Per section: `<h2>` 13px/600 graphite section title with "2 of 4" done count, then `<ol>`. Row states, each ≥ 44px tall, 15px:

| State | Look | Element |
|---|---|---|
| current | `bg-mark text-ink font-semibold`, left 3px ink bar | `<Link aria-current="page">` |
| done | `CheckCircle2` in `text-verified`, "Completed" in sr-only | `<Link>` |
| open | `Circle` (lecture) or `FileQuestion` (quiz) in graphite | `<Link>` |
| locked | `Lock` graphite, text graphite, "Locked" sr-only | `<span aria-disabled="true" data-state="locked">` |

Every row carries `data-state` (`current|done|open|locked`). A quiz row that is not passed and has locked rows after it gets a second line: "Pass this quiz to unlock the next lessons" (13px graphite). Duration shows as `m:ss`-free minutes ("7 min") right-aligned, tabular. Links call `onNavigate` on click (the sheet closes).

- [ ] **Step 3: Top bar**

`learn-top-bar.tsx` (server markup + the client sheet trigger): `<header className="sticky top-0 z-40 h-14 border-b border-rule bg-surface">`, a row with:
1. Back link, 44px: `ChevronLeft` + "My learning" (`/dashboard`) when enrolled, otherwise "Course page" (`/courses/{slug}`). Text hidden below `sm`, label kept via `aria-label`.
2. Course title, 15px/600, one line, truncated, `title` attribute.
3. Enrolled only: progress (`sm:` and up) — a 120px `Progress` with `aria-label="Course progress {percent}%"` and "{done} of {total} done" 13px graphite, tabular.
4. Below `lg`: `CurriculumSheet` trigger "Contents" (secondary, 44px, `ListTree` icon).
5. When `next` is set: "Next lesson" primary 44px link (`ChevronRight` after the text; label "Next lesson: {title}" via `aria-label`).

`html` has `scroll-padding-top: 5rem` already; the 56px bar is inside it.

- [ ] **Step 4: Rail (desktop) and sheet (phone)**

`learn-rail.tsx` (client): `hidden lg:flex` aside, `aria-label="Course contents"`, `sticky top-14 h-[calc(100dvh-3.5rem)]`, width 300px, border-right, its own scroll (`overflow-y-auto overscroll-contain`). A 44px "Hide contents" button collapses it to a 48px strip with a "Show contents" button (icon `PanelLeftOpen`, `aria-expanded`). Collapsed state persists in `localStorage` (`gm360:rail-collapsed`) read with `useSyncExternalStore` (server snapshot: expanded), like the video speed.

`curriculum-sheet.tsx` (client): `Sheet` + trigger button "Contents", `SheetContent side="left" title="Course contents"`, body = `CurriculumList` with `onNavigate={() => setOpen(false)}`. `lg:hidden` on the trigger.

- [ ] **Step 5: Shell**

```tsx
export function LearnShell({ course, currentId, next, children }: LearnShellProps) {
  return (
    <>
      <a href="#main" className="skip-link">Skip to lesson</a>
      <LearnTopBar course={course} currentId={currentId} next={next} />
      <div className="flex min-w-0 flex-1">
        <LearnRail>
          <CurriculumList sections={course.sections} slug={course.slug} currentId={currentId} />
        </LearnRail>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <div className="mx-auto flex max-w-[52rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Player page**

Replace the page's outer `<main>` grid and its `<aside>` with `<LearnShell …>`; the lesson header (title, type badge) comes first, then the lesson (video / article / quiz), then Complete/Next, then the existing panels (tabs arrive in plan 5). Build `sections` from `course.sections` (`durationSeconds` from `item.lecture?.durationSeconds ?? null`), `done` = completed items, `total` = all items. `next` is set only when the continue target exists and is not locked (`!next.locked`). Metadata title becomes the lesson title (`${item.title} | ${course.title}`): look the item up in `generateMetadata`.

- [ ] **Step 7: e2e selectors**

- "your progress" text → `page.getByRole("progressbar", { name: /course progress/i })`.
- `aside nav li span.cursor-not-allowed` → `nav[aria-label="Curriculum"] [data-state="locked"]`.
- `aside a[href=…]` → `nav[aria-label="Curriculum"] a[href=…]`.
- Specs that run at 375px use the top bar (the rail is hidden) — the only phone check is overflow, which is unchanged.

- [ ] **Step 8: Verify**

At 375×812 as the learner on the first TypeScript lesson: no site header or footer; the lesson title and the lesson start under the 56px bar; "Contents" opens the sheet, the current row is highlighted, Esc returns focus to "Contents". At 1440: rail visible, collapses and stays collapsed after reload. `ONLY=learn-article,learn-quiz npm run ui-audit` — no new axe rules (the old `color-contrast` on the curriculum should be gone).

- [ ] **Step 9: Commit** `Give the player a focus shell with a curriculum rail and a phone contents sheet`.

---

### Task 6: App shell for studio and admin

**Files:** Replace `app/(app)/layout.tsx`. Create `components/app/app-shell.tsx`, `components/app/app-sidebar.tsx`. Modify `app/(app)/studio/layout.tsx`, `app/(app)/admin/layout.tsx`. Delete `studio-nav.tsx`, `admin-nav.tsx`.

**Interfaces:** `AppShell({ user: { name, email }, roles, accountLinks, children })`; `AppSidebar({ roles, user, accountLinks, onNavigate? })`. Sections:

```ts
const STUDIO = [
  { href: "/studio", label: "Courses", icon: BookOpen },
  { href: "/studio/qa", label: "Questions", icon: MessagesSquare },
  { href: "/studio/announcements", label: "Announcements", icon: Megaphone },
  { href: "/studio/coupons", label: "Coupons", icon: TicketPercent },
];
const ADMIN = [
  { href: "/admin/payments", label: "Payments", icon: Banknote },
  { href: "/admin/refunds", label: "Refunds", icon: Undo2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/courses", label: "Courses", icon: Library },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
];
```

- [ ] **Step 1: Layout**

`app/(app)/layout.tsx` (server, `dynamic = "force-dynamic"`): `const user = await requireRole("INSTRUCTOR", "ADMIN")`, `roles = await getUserRoles(user.id)`, render `<AppShell user roles accountLinks={accountLinks({ signedIn: true, roles })}>{children}</AppShell>`. `studio/layout.tsx` keeps `requireRole("INSTRUCTOR", "ADMIN")` and returns `children`; `admin/layout.tsx` keeps `requireRole("ADMIN")` and returns `children`. Pages keep their own guards.

- [ ] **Step 2: Sidebar (client)**

`aside` 240px, `bg-surface border-r border-rule`, sticky full height, its own scroll. Top: wordmark link to `/` plus the word "Studio" or "Admin" in graphite (whichever section the path is in). Then `<nav aria-label="Studio">` (shown for INSTRUCTOR or ADMIN) and `<nav aria-label="Admin">` (ADMIN only), each with a 13px/600 graphite heading and 40px rows (icon 16px + label 15px). Active row (`isActivePath`, with `/studio` also active on `/studio/courses/**`): `bg-wash font-semibold` and a 3px ink bar on the left (`before:` pseudo-element), `aria-current="page"`. Bottom, pushed down with `mt-auto`: "View site" (`ExternalLink` icon, same tab) and `AccountMenu side="top" align="start"` with the name shown beside the avatar.

Keep the studio nav's workaround: a click on "Courses" from a studio child page calls `router.push("/studio")` (the plain Link did not swap the page slot; see the deleted `studio-nav.tsx` comment). Re-test without it and delete the workaround only if the plain link works.

- [ ] **Step 3: Shell**

```tsx
<div className="flex min-h-dvh min-w-0">
  <a href="#main" className="skip-link">Skip to content</a>
  <div className="hidden w-60 shrink-0 lg:block"><AppSidebar … /></div>
  <div className="flex min-w-0 flex-1 flex-col">
    {/* below lg */}
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-rule bg-surface px-4 lg:hidden">
      <Sheet> trigger "Menu" (44px) → SheetContent side="left" title="Studio and admin menu" titleHidden → <AppSidebar onNavigate={close} /></Sheet>
      <Link href="/">wordmark</Link>
    </header>
    <div id="main" tabIndex={-1} className="min-w-0 flex-1 bg-paper outline-none">{children}</div>
  </div>
</div>
```

No site footer in this shell.

- [ ] **Step 4: Verify**

As the instructor: Studio section only; as the admin: both. `aria-current` on the right item for `/studio/courses/{id}/curriculum`. At 375 the sidebar is a sheet. e2e selectors `navigation "Studio"` / `navigation "Admin"` still resolve (at 1280 the sidebar is visible). `ONLY=studio,admin-payments npm run ui-audit`.

- [ ] **Step 5: Commit** `Put studio and admin in an app shell with a sidebar`.

---

### Task 7: Checks, audit, progress log

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm run test`.
- [ ] **Step 2:** `npm run db:test:prepare -- --fresh`, then the SQL suites (`npm run test:db`, or `psql -h localhost -U postgres -d globalmentor360_test -q < prisma/tests/<suite>.sql` for each suite when the Docker container is not there) and `npm run test:db:flows`.
- [ ] **Step 3:** `npm run test:e2e` (fix selectors that assumed the old chrome; never weaken an assertion's intent).
- [ ] **Step 4:** `npm run build` and diff the route list against Task 2 Step 1 plus the two new routes (`/certificates`, `/help`).
- [ ] **Step 5:** `npm run ui-audit && npm run ui-audit:summary && npm run ui-audit:keyboard`. Expect 0 overflow, 0 text < 13px, no console errors; only the axe/target findings owned by plans 4–6.
- [ ] **Step 6:** Screenshots of home, dashboard, player and studio at 1440 and 375, checked against spec §5.
- [ ] **Step 7:** Progress log row in the spec. Commit `Record plan 2 in the progress log`, then `git push`.

## After this plan

Plan 3 (core components) builds `course-module` from `CurriculumList` so the home hero, landing page and dashboard share the player's states. `Sheet` shipped here, so plan 3 does not rebuild it.
