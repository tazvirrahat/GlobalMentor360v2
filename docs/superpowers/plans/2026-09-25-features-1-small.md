# Features, plan 8: the small ones (archive, course FAQ, duration filter)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first group in spec §12's order: the bKash reject reason on the receipt (done in plan 5 — the receipt shows it, the learner is notified), archive / unarchive in My learning, a course FAQ that instructors write and learners read on the course page, and a duration filter in the catalog.

**Architecture:** Archive needs no schema change (`Enrollment.archivedAt` exists and My learning already sorts on it); it gains one scoped write and a button. The FAQ is a new `course_faqs` table written through the existing `updateCourse` action, like the other landing-page lists, so Save stays one action. Duration is computed in SQL from lecture durations (no denormalised column), so a duration filter routes the catalog through its raw-SQL path, which already carries every other filter.

**Tech Stack:** Prisma 7 (migration SQL written from `prisma migrate diff`, applied with `prisma migrate deploy`), Next.js 16 server actions, Vitest (unit + integration), Playwright.

**Spec:** §12 (Partial → complete: My learning archive; Catalog duration filter and course FAQ; learner sees the reject reason).

## Global Constraints

- Migrations: generate with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, **delete any statement touching `search_vector`** or its indexes, save under `prisma/migrations/<timestamp>_<name>/migration.sql`, apply with `prisma migrate deploy`. Never `db push`; never let `migrate dev` reset a database. Additive changes only.
- Every write is scoped by the signed-in user in its `where` (archive) or by course ownership (FAQ).
- Copy reads like a course marketplace.

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/my-learning.ts` | modify | `setCourseArchived(userId, courseId, archived)`; archived courses leave the continue card |
| `lib/continue-learning.ts` | modify | skip archived enrollments |
| `app/(site)/dashboard/actions.ts` | create | `archiveCourseAction(formData)` |
| `app/(site)/dashboard/page.tsx` | modify | Archive / Unarchive per course row |
| `tests/integration/my-learning.test.ts` | create | archive moves a course between lists; scoped to the owner |
| `prisma/schema.prisma`, `prisma/migrations/…_course_faqs/` | modify/create | `CourseFaq` (question, answer, position) |
| `lib/course-faq.ts` (+ test) | create | `readFaqRows(formData)` pairs questions and answers, refuses half-filled rows |
| `app/(app)/studio/actions.ts` | modify | `updateCourse` replaces the FAQ with the other lists |
| `app/(app)/studio/courses/[courseId]/faq-editor.tsx` | create | labelled Question n / Answer n rows with Add / Remove |
| `lib/studio.ts`, `lib/courses.ts` | modify | select `faqs` |
| `app/(site)/courses/[slug]/page.tsx` | modify | "Frequently asked questions" as disclosures |
| `tests/integration/studio-landing.test.ts` | modify | FAQ saved, replaced, and refused when half-filled |
| `lib/catalog-duration.ts` (+ test) | create | buckets and `parseDurationBucket(raw)` |
| `lib/courses.ts` | modify | `duration` filter in SQL; SQL path when set |
| `app/(site)/courses/page.tsx`, `catalog-browser.tsx` | modify | Duration select + chip |
| `tests/integration/catalog-search.test.ts` | modify | duration buckets filter by summed lecture time |

---

### Task 1: Archive and unarchive

**Interfaces:**

```ts
// lib/my-learning.ts
export async function setCourseArchived(userId: string, courseId: string, archived: boolean): Promise<boolean>; // false when no live enrollment
```

- [x] `setCourseArchived`: `updateMany({ where: { userId, courseId, revokedAt: null }, data: { archivedAt: archived ? new Date() : null } })`, returns `count > 0`.
- [x] `getContinueLearning` ignores archived enrollments.
- [x] Action reads `courseId` + `archived`, calls it for the current user, revalidates `/dashboard`.
- [x] Row button: ghost sm "Archive" (in progress / completed) or "Unarchive" (archived), accessible name includes the course title.
- [x] Integration test: archive → the course is in `archived` only; unarchive → back; another user's call changes nothing.
- [x] Commit `Let learners archive and unarchive courses in My learning`.

### Task 2: Course FAQ

**Interfaces:**

```ts
// lib/course-faq.ts
export const FAQ_MAX = 20;
export type FaqRow = { question: string; answer: string };
export function readFaqRows(questions: string[], answers: string[]): { ok: true; rows: FaqRow[] } | { ok: false; message: string };
```

- [x] Schema `CourseFaq { id, courseId, question (≤300), answer Text (≤2000), position }`, `@@index([courseId, position])`, cascade on course delete; migration as above.
- [x] `readFaqRows`: trims, drops rows where both are blank, refuses a row with only one side ("Each question needs an answer, and each answer a question."), caps at `FAQ_MAX`. Unit tests.
- [x] `updateCourse` validates FAQ rows before any write and replaces them inside the existing transaction.
- [x] Studio Landing page tab: `FaqEditor` after the three lists.
- [x] Course page: "Frequently asked questions" after "Who this course is for", each a `<details>` with the question as summary (≥ 44px), answer as text with `CodeText`.
- [x] Integration tests in `studio-landing.test.ts`.
- [x] Commit `Add a course FAQ that instructors write and learners read`.

### Task 3: Duration filter

**Interfaces:**

```ts
// lib/catalog-duration.ts
export const DURATION_BUCKETS: readonly { value: "short" | "medium" | "long" | "extra"; label: string; minSeconds: number; maxSeconds: number | null }[];
export type DurationBucket = (typeof DURATION_BUCKETS)[number]["value"];
export function parseDurationBucket(raw: string | undefined): DurationBucket | undefined;
```

- [x] Buckets: Under 1 hour, 1 to 3 hours, 3 to 6 hours, Over 6 hours (min inclusive, max exclusive).
- [x] `catalogFilterSql` adds the summed-lecture-seconds condition; `listPublishedCourses` takes the SQL path when `search || duration`.
- [x] Catalog: Duration select between Price and Rating; chip "Under 1 hour" etc.
- [x] Integration test: a 30-minute and a 2-hour course land in the right buckets.
- [x] Commit `Filter the catalog by course length`.

### Task 4: Checks

- [x] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build, `ui-audit` + summary.
- [x] Progress log row; commit; push.
