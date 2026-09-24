# UI/UX overhaul, plan 5: learner pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the learner's own pages (spec §6): the player inside the plan 2 focus shell (lesson first, one row of actions, tabs for Overview / Q&A / Notes / Announcements with `?tab=`, notes stamped with the video time, a certificate at completion), My learning, Account, Orders and Notifications.

**Architecture:** The player page stays a server component that loads everything once; the tab strip is a small client component (Radix Tabs) that receives each panel as a server-rendered node, mounts only the selected one, and mirrors the choice into `?tab=` with `history.replaceState` (no server round trip). The video and the notes talk through a tiny client store (`player-clock.ts`: the current time, and a `seek` request) instead of prop drilling across server boundaries. Dashboard, account, orders and notifications are rebuilt on the plan 3 components; pure helpers (tab choice, day grouping, `m:ss` parsing) are unit-tested.

**Tech Stack:** Next.js 16.3 (server components, server actions, native `history.replaceState` integration with `useSearchParams`), React 19.2 (`useSyncExternalStore`, `useActionState`), Radix Tabs, Vitest, Playwright.

**Spec:** §5 (learn shell), §6 (dashboard, account, orders, notifications), §8. Plans 2–4 are done.

## Global Constraints

- The lesson and its Complete / Next actions must be in the first 812px on a 375px phone (spec §11).
- `--mark` only for the learner's position (the current lesson row). Completion is `verified`; pending is `caution`.
- Only one tab panel rendered at a time; tab state in `?tab=` so it deep-links and survives reload; Radix handles arrow keys, Home/End.
- No page-level duplicates of the account menu's links (Account, Orders, Sign out) on these pages.
- `tabular-nums` only on integers and through `Price`.
- Every destructive action confirms (revoke a session, sign out other devices, delete a note).

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/player.ts`, `lib/player.test.ts` | create | `pickTab(raw, available)`, `formatClock(seconds)`, `parseClock("m:ss")` |
| `app/(learn)/learn/[slug]/player-clock.ts` | create | client store: current video time, seek requests |
| `app/(learn)/learn/[slug]/player-tabs.tsx` | create | Radix Tabs mirrored into `?tab=` |
| `app/(learn)/learn/[slug]/[itemId]/page.tsx` | rewrite | lesson first, action row, completion certificate, tabs |
| `video-player.tsx`, `notes-panel.tsx`, `note-form.tsx` (new), `complete-lecture-form.tsx`, `qa-panel.tsx`, `ask-question-form.tsx`, `reply-form.tsx`, `announcements-panel.tsx`, `quiz-form.tsx` | modify | restyle; clock publish/seek; "At (m:ss)" field; timestamp chips |
| `lib/dashboard.ts`, `lib/dashboard.test.ts` | create | `defaultLearningTab(counts)` |
| `app/(site)/dashboard/page.tsx` | rewrite | greeting, continue card, pending payments, tabs defaulting to the first non-empty |
| `app/(site)/account/page.tsx`, `account-forms.tsx`, `actions.ts` | rewrite/modify | sub-nav, Profile (name), Email, Password, Sessions; confirms |
| `lib/auth.component.test.ts` | modify | sign-out lives in the account menu |
| `lib/orders.ts`, `app/(site)/orders/page.tsx`, `orders/[orderId]/page.tsx` | modify/rewrite | table, printable receipt, reject reason |
| `lib/payments/manual-review.ts` | modify | notify the learner when a payment is rejected, with the reason |
| `lib/notifications.ts` (+ test), `app/(site)/notifications/page.tsx` | modify/rewrite | grouped by day, unread dot |
| `e2e/*.spec.ts` | modify | tabs, renamed headings and buttons |

---

### Task 1: Player helpers and the clock

**Interfaces:**

```ts
// lib/player.ts
export const PLAYER_TABS = ["overview", "qa", "notes", "announcements"] as const;
export type PlayerTab = (typeof PLAYER_TABS)[number];
export function pickTab(raw: string | undefined, available: readonly PlayerTab[]): PlayerTab; // unknown → first available
export function formatClock(seconds: number): string; // 0 → "0:00", 75 → "1:15", 3725 → "1:02:05"
export function parseClock(text: string): number | null; // "1:15" → 75, "75" → 75, "1:02:05" → 3725, "x" → null, "1:75" → null

// player-clock.ts (client)
export function publishTime(seconds: number): void;
export function useVideoTime(): number | null; // null when no video on the page
export function requestSeek(seconds: number): void;
export function onSeekRequest(handler: (seconds: number) => void): () => void;
```

- [ ] Tests first for `pickTab`, `formatClock`, `parseClock`; implement; the clock is a module-level store read with `useSyncExternalStore` (server snapshot `null`).
- [ ] Commit `Add the player's tab and time helpers`.

### Task 2: Player page

**Layout (inside `LearnShell`):**

1. Lesson header: h1 title (24/32px), a meta line (Lecture/Quiz, "Free preview" badge, "Completed" verified badge), Bookmark (secondary, 40px, `aria-pressed`).
2. Completion (course at 100% and a serial): `Certificate size="card"` beside "You finished {course}" and "View certificate" (primary) / "Download PDF".
3. The lesson: video (16:9) / article (68ch, 18px/1.7, paragraphs split on blank lines) / quiz.
4. Action row: for an unfinished lecture, "Mark lesson complete" (primary, 44px; "Complete and continue" when a next lesson exists — the action already continues). For a finished item with a next one, "Next lesson" (primary). For the course's last item, "Back to My learning".
5. Tabs (`PlayerTabs`): Overview (the lecture's description, or its section and position when there is none), Q&A ({n}), Notes ({n}) — enrolled only, Announcements ({n}) — enrolled and only when there are some. Counts in the tab names. The tab strip scrolls horizontally on narrow screens; triggers ≥ 44px.

- [ ] `PlayerTabs({ initial, tabs: { value, label, count?, panel: ReactNode }[] })`: Radix `Tabs` with `value` state; `onValueChange` → `history.replaceState(null, "", url with ?tab=)`, preserving other params; the tab trigger shows "Q&A" and the count in a separate element ("Q&A 3", accessible name "Q&A, 3").
- [ ] e2e: open the Notes / Q&A tab before using them; `/mark complete and continue/` → `/complete and continue/`; `/mark complete/` → `/mark lesson complete|complete and continue/`.
- [ ] Verify at 375×812: the lesson and the action row are above the fold on the first TypeScript lesson (measure `getBoundingClientRect().bottom` of the action row after scrolling the article's first paragraph into view — the article is long, so the check is that the **Complete** button is reachable without passing any tab content, and that the video/quiz variants fit).
- [ ] Commit `Put the lesson first and the rest of the player in tabs`.

### Task 3: Notes stamped with the video time

- [ ] `VideoPlayer` publishes `currentTime` (throttled to 1s) and subscribes to seek requests (`el.currentTime = s; el.focus()`).
- [ ] `NoteForm` (client): textarea "Note", then "At (m:ss)" text input (`inputMode="numeric"`, pattern hint) prefilled from `useVideoTime()` when the textarea gets focus and a video is present; the field is hidden for articles (the time is 0). Server action parses with `parseClock`, rejects bad input with a field error.
- [ ] Notes list: newest first; a `m:ss` chip (`button`, 32px, "Play from 1:15") that calls `requestSeek` when there is a video; delete asks for confirmation (a second click on "Delete" within the row: "Delete note?" Yes / Cancel).
- [ ] Commit `Stamp notes with the video time and let a note seek back to it`.

### Task 4: Q&A, announcements, quiz restyle

- [ ] Q&A: the ask form collapsed behind "Ask a question" (a `details` with a 44px summary) above the threads; threads as a list with title, author, date (separate elements), body, replies indented with the instructor label as a neutral badge; "Reply" disclosure.
- [ ] Announcements: list, newest first, subject (h3), date, body, "From {author}".
- [ ] Quiz: questions as fieldsets with legends, options as 44px rows, result as a `verified`/`destructive` alert with the score (proportional figures), the answer key after submitting (already exists) restyled; "Try again" when retakes are allowed.
- [ ] Commit `Restyle Q&A, announcements and quizzes on the new tokens`.

### Task 5: My learning

- [ ] `defaultLearningTab({ inProgress, completed, archived })` → first non-empty of in-progress, completed, archived, else in-progress. Tests.
- [ ] Page: h1 "My learning", a greeting line ("Welcome back, {first name}."), the `ContinueCard` for the most recent in-progress course, a caution notice per payment awaiting verification ("Your payment for {course} is being checked." → link to the order), then tabs In progress / Completed / Archived (counts) defaulting per the helper. Rows: `CoverMark`, title, instructor, progress bar + "{n}% complete" (integer), Resume/Review; completed rows show `CertificateChip`. Remove the page-level Account / Purchases / Sign out buttons and the role badges.
- [ ] e2e: "Welcome back" heading → the "My learning" heading.
- [ ] Commit `Rebuild My learning around continuing and certificates`.

### Task 6: Account

- [ ] Layout: `md:grid-cols-[12rem_1fr]`; left sub-nav (in-page links, `aria-current="true"` on the section in view is not needed — plain anchor links) Profile, Email, Password, Devices; single column on phones.
- [ ] Profile: name form (server action `updateNameAction`: trimmed, 1–100 chars, `db.user.update`, revalidate `/account` and the layout) — the Help page promises it. Member since.
- [ ] Email, Password (PasswordInput ×3), Devices (sessions list; "Sign out" per device and "Sign out other devices" each confirm with a second step). Each form confirms inline in a `role="status"` line.
- [ ] Remove the page's Sign out button and the My learning / Orders / Notifications buttons; update `lib/auth.component.test.ts` to check that the account menu offers Sign out.
- [ ] Commit `Rebuild Account as sections with a name form and confirmed sign-outs`.

### Task 7: Orders and receipts

- [ ] `/orders`: a real `<table>` (Order, Courses, Date, Total, Status, receipt link) with a fixed column template; phone collapses to a list. h1 "Orders".
- [ ] `/orders/[id]`: printable receipt (`print:` styles hide chrome), order number in `Serial`, items, totals `<dl>`, payment rows (method, status badge, date, transaction ID `Serial`). **Rejected bKash payment:** a `destructive` notice with the admin's reason (`verificationNotes`) and "Pay again" linking to the course checkout.
- [ ] `rejectManualPayment` also notifies the learner ("Payment not accepted" with the reason, linking to the order). Integration test in `tests/integration/bkash-approval.test.ts`.
- [ ] e2e: "Purchases" heading → "Orders".
- [ ] Commit `Show orders as a table and tell the learner why a payment was rejected`.

### Task 8: Notifications

- [ ] `groupByDay(items, now)` → "Today", "Yesterday", or a date; tests.
- [ ] Page: h1 "Notifications", "Mark all read" (secondary) when any unread; groups with h2 day headings; each item a full-width button-link (title, body one line, time) with an 8px ink dot + sr-only "Unread" for unread ones; "Mark as read" as a 32px ghost button.
- [ ] Commit `Group notifications by day and mark unread with a dot`.

### Task 9: Checks

- [ ] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build.
- [ ] `npm run ui-audit` + summary + keyboard. Learner routes: 0 axe, 0 small targets, 0 text < 13px; player phone: lesson + actions visible before any tab content.
- [ ] Progress log row; commit; push.
