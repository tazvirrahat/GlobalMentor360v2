# UI/UX overhaul, plan 6: studio and admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every studio and admin page into the plan 2 app shell's page pattern (spec §5 app shell, §6 Studio / Admin): a page header with one primary action, real `<table>`s with fixed columns and pagination below only, a tabbed course editor (Details, Landing page, Pricing, Curriculum, Publish) whose list inputs are labelled, reorder by buttons for sections as well as lessons, destructive actions that confirm, a payments queue whose Reject opens a dialog that requires a reason, and search on Refunds, Users, Courses and Reviews.

**Architecture:** Three small shared pieces in `components/app/` carry the pattern so pages stop re-implementing it: `PageHeader` (back link, h1, description, actions), `ListFooter` ("Showing X to Y of Z" + `PageNav`, rendered once, under the table) and `SearchBox` (a GET form that keeps the other query params). `components/ui/table.tsx` becomes the one table style (fixed layout, sticky header on desktop, `wash` row hover, 24px row targets). The course editor is one server page that loads the course once and hands a client `CourseEditor` the panels: Details, Landing page and Pricing live inside the one existing `updateCourse` form (so Save still saves everything and no server action changes shape), each panel stays mounted and is hidden when inactive, and the choice is mirrored into `?tab=` with `history.replaceState`. Curriculum stays its own route and appears in the same editor nav as a link. Pure helpers (tab choice, list-row labels, coupon value parsing) are unit-tested; `moveSection` gets an integration test next to `moveItem`'s.

**Tech Stack:** Next.js 16.3 (server components, server actions, `history.replaceState` + `useSearchParams`), React 19.2 (`useActionState`, `flushSync`), Radix Dialog / Select, Vitest, Playwright.

**Spec:** §5 (app shell), §6 (Studio, Admin), §7 (table, dialog), §8. Plans 2–5 are done.

## Global Constraints

- Tables: real `<table>` with `<caption class="sr-only">`, `scope="col"` headers, `table-fixed` + `<colgroup>` widths so rows align; the title cell's link is the row's way in and is at least 24px tall; pagination only below the table; empty and no-match states say what to do next.
- One primary (ink) button per page header. Secondary actions are `secondary` or `ghost`.
- Destructive actions confirm first (`ConfirmSubmit` inline, or a dialog when a reason is required): delete section, delete lesson, unpublish, refund, reject.
- No product-internal copy on these pages either ("minor units", "rails", "out of band"): write for an instructor or an admin who is not a developer.
- `tabular-nums` only on integers and through `Price`. Plex Mono only for codes (transaction IDs, coupon codes, certificate numbers), never for prose — the article editor loses its mono font.
- Keep every server action's form contract unless a task says otherwise; e2e changes are listed per task.
- `--mark` is not used in the app shell (learning position only). Active nav and tabs use ink.

## File map

| File | Change | Responsibility |
|---|---|---|
| `components/app/page-header.tsx` | create | `PageHeader({ title, description?, back?, actions?, meta? })` |
| `components/app/list-footer.tsx` | create | `ListFooter({ range, total, pathname, params?, page, pageCount })` |
| `components/app/search-box.tsx` | create | `SearchBox({ action, label, placeholder, value, keep? })` GET form + Clear |
| `components/ui/table.tsx` | modify | fixed layout option, sticky desktop header, token colours, row targets |
| `components/site/empty-state.tsx` | rewrite | plain panel (no icon disc): title, message, action |
| `lib/course-editor.ts` (+ test) | create | `COURSE_EDITOR_TABS`, `pickEditorTab(raw)`, `listRowLabel(noun, index)` |
| `components/app/course-editor-nav.tsx` | create | editor nav: Details, Landing page, Pricing, Curriculum, Publish |
| `app/(app)/studio/page.tsx`, `new-course-form.tsx`, `new-course-dialog.tsx` (new) | rewrite | Courses table; "New course" dialog |
| `app/(app)/studio/courses/[courseId]/page.tsx`, `settings-form.tsx`, `course-editor.tsx` (new), `list-editor.tsx` (new) | rewrite | tabbed editor; labelled list rows with Add / Remove |
| `app/(app)/studio/curriculum-actions.ts` | modify | `moveSection` |
| `tests/integration/curriculum-*.test.ts` | modify | `moveSection` swaps and stops at the ends |
| `app/(app)/studio/courses/[courseId]/curriculum/*` | rewrite/modify | sections with reorder, confirmed deletes, no fake drag handle |
| `.../curriculum/[itemId]/page.tsx`, `lecture-editor.tsx`, `quiz-builder.tsx`, `caption-upload.tsx`, `video-upload.tsx` | modify | restyle; article hint matches the player; no mono prose |
| `app/(app)/studio/qa/*`, `announcements/*`, `coupons/*` | modify | page header, tables, coupon "Amount off" in whole currency |
| `app/(app)/studio/coupons/actions.ts`, `lib/coupon-input.ts` (+ test) | create/modify | `parseCouponValue(type, raw)` whole amount → minor units |
| `app/(app)/admin/payments/*` | rewrite | queue table; Approve; Reject dialog with required reason |
| `app/(app)/admin/refunds/page.tsx`, `refund-dialog.tsx` (new) | rewrite | table + search; refund dialog with reason |
| `app/(app)/admin/users/page.tsx`, `courses/page.tsx`, `reviews/page.tsx` | rewrite | tables + search |
| `lib/refunds.ts`, `lib/admin.ts` | modify | optional `q` on refundable orders and reviews |
| `e2e/*.spec.ts` | modify | selectors named per task |

---

### Task 1: Shared pieces

**Interfaces:**

```tsx
// components/app/page-header.tsx
export function PageHeader(props: {
  title: ReactNode;               // the page's h1
  description?: ReactNode;        // one line, graphite
  back?: { href: Route; label: string }; // 24px+ link above the title
  meta?: ReactNode;               // status badge etc., beside the title
  actions?: ReactNode;            // right-aligned; one primary at most
}): JSX.Element;

// components/app/list-footer.tsx — "Showing 21 to 40 of 57" then the pager; nothing when total is 0
export function ListFooter(props: {
  range: { from: number; to: number }; total: number;
  pathname: string; params?: Record<string, string | undefined>;
  page: number; pageCount: number;
}): JSX.Element | null;

// components/app/search-box.tsx — GET form; hidden inputs for `keep`; "Clear" link when value is set
export function SearchBox(props: {
  action: Route; label: string; placeholder?: string; value?: string;
  keep?: Record<string, string | undefined>;
}): JSX.Element;
```

- [ ] `PageHeader`: `header` with flex-wrap; h1 `text-2xl sm:text-3xl font-semibold`; back link `inline-flex min-h-8 items-center gap-1 text-sm text-graphite hover:text-ink focus-ring`.
- [ ] `ListFooter`: `text-sm text-graphite` line only when `pageCount > 1`, then `PageNav` with its top margin reduced (`[&_nav]:mt-3`).
- [ ] `SearchBox`: visible `<Label>` (sr-only is fine only when the placeholder repeats it — use visible), `Input type="search" name="q"`, `Button variant="secondary"` "Search", "Clear" link; `role="search"`.
- [ ] `Table`: container `overflow-x-auto lg:overflow-visible`; `TableHeader` `lg:sticky lg:top-0 z-10 bg-wash`; `TableHead` defaults `scope="col"`, `h-10 px-3 text-left text-sm font-semibold text-graphite`; `TableCell` `px-3 py-2.5 align-middle`; `TableRow` border `rule`, hover `wash/60`. `TableFooter` token colours.
- [ ] `EmptyState`: `rounded-lg border border-rule bg-surface p-6`, left-aligned h2/h3, graphite message, children as actions. Drop the `icon` prop and update every call site.
- [ ] Commit `Add page header, list footer and search box for the app shell`.

### Task 2: Studio courses

- [ ] `/studio`: `PageHeader` title "Courses", description "Create a course, then build its lessons and publish it.", action `NewCourseDialog` (primary "New course" → `Dialog` titled "New course" holding `NewCourseForm`; `createCourse` already redirects to the editor).
- [ ] Table columns: Course (title link + "N sections" graphite under it + sellability warning in `seal`), Status (`StatusBadge`), Learners (right, integer), Updated (`formatDateMedium`), actions ("Course page" link, 32px, published only). Empty: "No courses yet" + "New course" button.
- [ ] e2e: `heading "Studio"` → `heading level 1 "Courses"` (qa-studio ×3); create flows click "New course" first, then fill Title in the dialog (qa-studio ×2).
- [ ] Commit `Show studio courses as a table with a New course dialog`.

### Task 3: Tabbed course editor

**Interfaces:**

```ts
// lib/course-editor.ts
export const COURSE_EDITOR_TABS = ["details", "landing", "pricing", "publish"] as const;
export type CourseEditorTab = (typeof COURSE_EDITOR_TABS)[number];
export function pickEditorTab(raw: string | undefined): CourseEditorTab; // unknown → "details"
export function listRowLabel(noun: string, index: number): string;      // ("Objective", 0) → "Objective 1"
```

- [ ] Server page: `PageHeader` (back "Courses", title = course title, meta = `StatusBadge`, action = "Course page" link when published), sellability `Alert` (destructive when published, caution otherwise), `CourseEditorNav`, then `CourseEditor` with `initialTab={pickEditorTab(searchParams.tab)}` and the readiness checks.
- [ ] `CourseEditorNav({ courseId, current, onSelect? })`: `nav aria-label="Course editor"`; Details / Landing page / Pricing / Publish link to `?tab=`; Curriculum links to `/curriculum`; `aria-current="page"` + 2px ink underline on the current one; 40px tall. When `onSelect` is given (settings page), clicks on the four in-page items call it and `history.replaceState` instead of navigating.
- [ ] `CourseEditor`: one `<form action={updateCourse}>` holds three panels (`section aria-labelledby` + h2, `hidden` when inactive): **Details** (title, subtitle, description, level, language), **Landing page** (three `ListEditor`s), **Pricing** (amount + currency, the bKash note rewritten). A save bar under the panels (hidden on Publish): status line + "Save". **Publish** panel sits outside the form: readiness list (verified check / seal cross, hint under a failed item), `PublishForm` (unpublish confirms with `ConfirmSubmit`).
- [ ] Invalid field in a hidden panel: `onInvalidCapture` on the form finds the panel (`data-tab`) and switches to it inside `flushSync`, so the browser can focus the field and show its message.
- [ ] `ListEditor({ name, legend, hint, noun, defaults, max = 12 })`: client rows (stable ids), each `Input` labelled `listRowLabel(noun, i)` with a visible number, "Remove {noun} {n}" icon button (32px), "Add {noun}" secondary button (disabled at `max`). Starts with the defaults or one empty row. Same `name` so `updateCourse` is untouched. This fixes the axe `label` ×28.
- [ ] Unit tests for `pickEditorTab`, `listRowLabel`.
- [ ] e2e (qa-studio): `getByText("Settings")` → editor nav visible; "What you'll learn" after clicking "Landing page"; "Edit curriculum" → nav link "Curriculum".
- [ ] Commit `Split the course editor into tabs and label every list row`.

### Task 4: Curriculum

- [ ] `moveSection(prev, fd)` in `curriculum-actions.ts`: owner check through `course.instructorId`, swap with the neighbour using the same park position as `moveItem` (sections have `@@unique([courseId, position])`); "Already at the end." at the ends; revalidate. Integration test beside `moveItem`'s.
- [ ] Page: editor header + `CourseEditorNav current="curriculum"`, h2 "Curriculum" with "N sections, N lessons, N quizzes".
- [ ] Section block: "Section N" (graphite) + h3 title; Move up / Move down (icon, labelled "Move section {title} up"), "Delete section" through `ConfirmSubmit` ("Delete this section and its lessons?").
- [ ] Lesson row: type icon, title link (`min-h-8`), "Lesson"/"Quiz" in graphite, "Free preview" badge, controls: move up/down, preview toggle (labelled "Turn free preview on/off for {title}"), delete through `ConfirmSubmit`. No `GripVertical` (drag is phase 8). Empty-quiz warning stays, in `seal`.
- [ ] Video panel restyled into the row; add forms as a quiet row at the section's foot.
- [ ] Commit `Rebuild the curriculum editor with section reorder and confirmed deletes`.

### Task 5: Lesson and quiz editors

- [ ] Item page: back link "Curriculum" (`min-h-8`), h1 item title, "Lesson"/"Quiz" + "In {section}" meta.
- [ ] Lecture editor: plain panel; article body loses `font-mono`; hint: "Leave a blank line between paragraphs. Put code in backticks, like `npm install`, to show it in a code font." (what the player renders). Video lectures keep the "not shown while there is a video" note.
- [ ] Quiz builder, caption upload, video upload: token colours, no `font-heading`/`tracking-tight`/`muted-foreground`, 24px+ controls, destructive actions confirm.
- [ ] Commit `Restyle the lesson and quiz editors`.

### Task 6: Questions, announcements, coupons

- [ ] Questions inbox: `PageHeader` (description = waiting count), filters in one row (Needs my answer toggle link, Course select + Apply, Asked chips), threads as a list with course, learner, asked date, answered state, reply form; `ListFooter`.
- [ ] Announcements: header, composer panel, sent list as a table (Subject, Course, Sent, Recipients).
- [ ] Coupons: header, table (Code in Plex Mono, Applies to, Discount, Used, Status) + create panel. Type options "Percent off" / "Amount off"; the value field's label follows the type; "Amount off" takes a whole amount (৳500), stored in minor units by `parseCouponValue`. Table shows "20% off" / "500 off".
- [ ] `lib/coupon-input.ts`: `parseCouponValue(type, raw): { ok: true; value: number } | { ok: false; message: string }` with tests (percent 1–100 integer; amount > 0, up to 2 decimals → ×100).
- [ ] Commit `Restyle questions, announcements and coupons; coupon amounts in whole currency`.

### Task 7: Admin payments

- [ ] Queue table: Submitted (date, time under it), Learner (name, email under), Courses, Amount (`Price`, right), bKash (sender number and transaction ID in Plex Mono, reference if any), Actions.
- [ ] Actions: "Approve and enrol" (primary sm) submits directly; "Reject" (secondary sm) opens a `Dialog` "Reject this payment?" with a required `Textarea` "Reason for rejection", hint "The learner sees this reason on their receipt and in a notification.", "Reject payment" (destructive) + Cancel. Error stays in the dialog; success closes it and the row leaves.
- [ ] Header: title "Payment verification", meta = caution badge "N waiting". Empty: "Nothing to review" + where proofs come from.
- [ ] e2e (qa-admin reject): click row "Reject" → fill dialog "Reason for rejection" → click "Reject payment"; hint asserted inside the dialog.
- [ ] Commit `Show the payments queue as a table and reject through a dialog`.

### Task 8: Refunds, users, courses, reviews

- [ ] `listRefundableOrders(page, q?)` and the reviews list take `q` (learner name/email or course title, case-insensitive `contains`); existing callers unchanged.
- [ ] Refunds: `SearchBox`, table (Courses, Learner, Paid, Amount, action "Refund…" → dialog with required "Reason" + "Refund and revoke access"). Description: "Recording a refund removes the learner's access. Send the money back through Stripe or bKash yourself."
- [ ] Users: table (Name + email, Joined, Roles, actions "Make instructor"/"Remove instructor", "Make admin"/"Remove admin"; removing a role confirms).
- [ ] Courses: table (Course + instructor, Learners, Status, actions: "Course page" 32px, Publish / Unpublish — unpublish confirms).
- [ ] Reviews: `SearchBox`, table (Course, Learner, Rating, Review excerpt, Posted, Hide/Show).
- [ ] e2e: refund flow opens the dialog (qa-admin); critical-path accepts row button "Refund…"; admin course/review selectors as needed.
- [ ] Commit `Show refunds, users, courses and reviews as searchable tables`.

### Task 9: Checks

- [ ] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build.
- [ ] `npm run ui-audit` + summary + keyboard: studio and admin routes 0 axe (the `label` ×28 gone), 0 small targets, 0 text < 13px, 0 overflow.
- [ ] grep `app/(app)` for `muted-foreground|font-heading|tracking-tight|text-primary|bg-card|shadow-sm` → none.
- [ ] Progress log row; commit; push.
