# Features, plan 10: course review before publishing, and course images

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec §12 "Studio: … course thumbnail …, in-review lifecycle (instructor submits, admin approves/returns with notes)". An instructor who is not an admin no longer publishes directly: they submit a finished course, an admin approves it (it goes live) or returns it with a note the instructor reads on the Publish tab. Instructors can also give a course an image that replaces the letter tile wherever the course appears.

**Architecture:** `CourseStatus.IN_REVIEW` already exists. Two nullable columns carry the conversation: `reviewNote` (the admin's last note on a returned course) and `reviewRequestedAt` (when it was submitted, for the queue's order). All transitions live in one module, `lib/course-review.ts`, which checks readiness, writes the status, an audit row, and a notification in one place; the studio and admin actions are thin wrappers. Admins keep direct publish (they are the reviewers). Course images reuse the resource-file storage path: presigned PUT under `course-images/<courseId>/…`, the key stored in the existing `thumbnailUrl` column, served by `/api/course-images/<courseId>` as a short-lived presigned GET redirect (the bucket is private). The promo video is deferred to plan 13 with resumable uploads, since it rides the video pipeline.

**Tech Stack:** Prisma 7 (additive migration, `migrate deploy`), Next.js 16 server actions and route handlers, Vitest, Playwright.

## Global Constraints

- Only a course's owner submits it; only admins approve or return. Every transition is audited (`course.review.submit|approve|return`).
- Approve re-runs the readiness checklist; a course that is no longer ready cannot be approved.
- Editing a published course stays live without another review (documented on the Publish tab).
- A returned course goes back to Draft with the note; submitting again clears the note.
- Migration additive, trimmed of `search_vector`, applied with `prisma migrate deploy`.
- Images: JPEG, PNG or WebP, up to 5 MB; `alt=""` where the title is already next to it.

## File map

| File | Change | Responsibility |
|---|---|---|
| `prisma/schema.prisma`, `prisma/migrations/…_course_review/` | modify/create | `Course.reviewNote`, `Course.reviewRequestedAt` |
| `lib/course-review.ts` | create | `submitForReview`, `approveReview`, `returnReview`, `listReviewQueue` |
| `lib/notifications.ts` | modify | `course_review` notification type |
| `tests/integration/course-review.test.ts` | create | the lifecycle, the guards, the audit rows |
| `app/(app)/studio/actions.ts` | modify | `setPublished` routes non-admin publish to `submitForReview` |
| `app/(app)/studio/courses/[courseId]/publish-form.tsx`, `page.tsx` | modify | Submit for review / In review / returned note |
| `app/(app)/admin/courses/page.tsx`, `review-actions.tsx`, `../actions.ts` | modify/create | "Waiting for review" table with Approve and Return (dialog, required note) |
| `lib/course-image.ts` (+ test) | create | `COURSE_IMAGE_TYPES`, `courseImageKey`, `isCourseImageKey` |
| `app/(app)/studio/course-image-actions.ts`, `…/course-image-field.tsx` | create | upload / remove on the Details tab |
| `app/api/course-images/[courseId]/route.ts` | create | published (or own) course image redirect |
| `components/course/cover-mark.tsx` | modify | image when the course has one, letter tile otherwise |

---

### Task 1: Review lifecycle

**Interfaces:**

```ts
// lib/course-review.ts
export type ReviewResult = { ok: true } | { ok: false; message: string };
export async function submitForReview(instructorId: string, courseId: string): Promise<ReviewResult>;
export async function approveReview(adminId: string, courseId: string): Promise<ReviewResult>;
export async function returnReview(adminId: string, courseId: string, note: string): Promise<ReviewResult>;
export async function listReviewQueue(): Promise<{ id: string; title: string; slug: string; instructorName: string; reviewRequestedAt: Date | null }[]>;
```

- [x] Migration: two nullable columns.
- [x] `submitForReview`: owner only; status DRAFT or UNPUBLISHED; readiness passes; sets IN_REVIEW, `reviewRequestedAt`, clears `reviewNote`; audit; notifies admins.
- [x] `approveReview`: IN_REVIEW only; readiness passes; PUBLISHED (+ `publishedAt` once); audit; notifies the instructor.
- [x] `returnReview`: IN_REVIEW only; note required (≤ 1000); DRAFT + note; audit; notifies the instructor with the note.
- [x] Studio: `setPublished(publish=true)` for a non-admin calls `submitForReview`; Publish tab shows "Submit for review" (ready), "In review since …" with "Withdraw" (back to Draft), or a caution alert with the returned note above the checklist.
- [x] Admin Courses: a "Waiting for review" table above the full list (Course + instructor, Submitted, Approve and publish, Return…). Return opens a dialog with a required note.
- [x] Integration tests; e2e: instructor submits, admin returns with a note, instructor sees it.
- [x] Commit `Send instructors' courses through review before they go live`.

### Task 2: Course images

- [x] `lib/course-image.ts`: allowed types, 5 MB cap, `courseImageKey(courseId, id, type)`, `isCourseImageKey(key, courseId)`; unit tests.
- [x] Actions (owner-scoped): `startCourseImageUpload`, `finishCourseImageUpload` (HEAD; stores key in `thumbnailUrl`; deletes the previous object), `removeCourseImage`.
- [x] Details tab: "Course image" field showing the current image or the letter tile, Upload / Remove; with storage unset, the same plain note as resources.
- [x] `/api/course-images/[courseId]`: published courses for everyone, drafts for their owner; 404 otherwise; redirect to a presigned GET, `Cache-Control: public, max-age=300` for published.
- [x] `CoverMark` takes `imageUrl`; course rows, the course page, My learning and the continue card pass it when `thumbnailUrl` is set.
- [x] Commit `Let instructors give a course an image`.

### Task 3: Checks

- [x] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build, `ui-audit` + summary.
- [x] Progress log row; commit; push.
