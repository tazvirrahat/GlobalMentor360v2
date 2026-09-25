# Features, plan 13: resumable video uploads, drag reorder, promo video

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec §12 "Studio: drag-and-drop curriculum reorder (keep buttons), resumable/multipart video upload with progress, course thumbnail + promo video upload" (the thumbnail shipped in plan 10).

**Architecture:**

- **Drag reorder.** Sections within a course and items within a section can be dragged by a grip. HTML5 drag and drop with an optimistic local order; the drop sends the whole new order to one action (`reorderSections(courseId, ids)`, `reorderItems(sectionId, ids)`), which checks ownership and that the ids are exactly the current set, then rewrites positions in one transaction (the two-pass parking `resequence` already uses, so `@@unique(..., position)` never sees a clash). The Up/Down buttons stay: they are the single-pointer and keyboard alternative WCAG 2.5.7 asks for, and the only way on touch screens, where HTML5 drag does not fire. The grip is decorative (`aria-hidden`) for that reason. Moving an item to another section stays out of scope, as it is for the buttons.
- **Resumable uploads.** Video uploads become S3 multipart: `startResumableVideoUpload` creates the `MediaAsset` (UPLOADING, bound to its user and target like today) and a multipart upload; the browser uploads 16 MB parts (larger for huge files, never more than 10,000 parts) to presigned part URLs signed in batches, retrying each part three times; `finishResumableVideoUpload` lists the parts in S3 itself (so the bucket need not expose `ETag` to the browser), checks every part is there, completes the upload, and runs the existing start-processing-and-attach step. The browser remembers an unfinished upload (asset, upload id, part size) per target and file (name, size, last modified); choosing the same file again resumes from the parts S3 already has. Cancel aborts the multipart upload. The one-request `startVideoUpload`/`finalizeVideoUpload` pair is replaced.
- **Promo video.** `Course.promoVideoId` exists. The Landing page tab gets a "Promo video" field that uses the same resumable uploader with a course target (the asset's `startedForItemId` holds `course:<id>`, a string column with no foreign key, so the bind check works unchanged). Once READY, the course page's buy box shows "Watch the promo" opening a dialog with the video; `getPromoPlayback(courseId)` signs it for anyone when the course is published and for its instructor and admins before. The player takes a `source` (lecture or promo); a promo reports no progress and has no autoplay-next. Replacing or removing a promo releases the old asset (`releaseOrphanedLectureAsset` already refuses to delete an asset a course still points at).

**Tech Stack:** `@aws-sdk/client-s3` multipart commands + `s3-request-presigner`, hls.js, Next.js 16 server actions, Vitest, Playwright.

## Global Constraints

- No schema change.
- Every reorder, part signature, finish and promo write re-checks ownership; a part request is limited to 50 part numbers within 1–10,000.
- Locally (AWS unset) uploads say they need storage; drag reorder works fully and is covered by e2e.
- Buttons keep working without script; drag is an enhancement.

## File map

| File | Change | Responsibility |
|---|---|---|
| `app/(app)/studio/curriculum-actions.ts` | modify | `reorderSections`, `reorderItems` |
| `app/(app)/studio/courses/[courseId]/curriculum/use-drag-order.ts` | create | the drag state and optimistic order |
| `…/curriculum/curriculum-editor.tsx` | modify | grips, drop targets, optimistic lists |
| `lib/video/multipart.ts` (+ test) | create | `planUpload`, `partRange`, `missingParts` |
| `lib/video/aws.ts` | modify | create / sign part / list parts / complete / abort |
| `app/(app)/studio/video-actions.ts` | modify | resumable start / sign / resume / finish / cancel for a lecture or a promo |
| `…/curriculum/resumable-upload.ts` | create | the browser side: parts, retries, resume record |
| `…/curriculum/video-upload.tsx` | modify | uses it, shows "Resuming…" |
| `app/(app)/studio/courses/[courseId]/promo-video-field.tsx`, `course-editor.tsx`, `page.tsx` | create/modify | Landing page "Promo video" |
| `app/(site)/courses/[slug]/promo-dialog.tsx`, `page.tsx`, `actions` | create/modify | "Watch the promo" |
| `app/(learn)/learn/[slug]/video-player.tsx` | modify | `source` prop |
| `tests/integration/curriculum-reorder.test.ts`, `resumable-upload.test.ts` | create | ownership, exact-set check, guards |

---

### Task 1: Drag reorder

- [x] `reorderSections(courseId, ids)` / `reorderItems(sectionId, ids)`: owner only; ids must equal the current set; positions 0…n−1 in one transaction.
- [x] `useDragOrder(ids, commit)`: optimistic order, dragged id, drop index; reverts and reports on failure.
- [x] Grip on each section header and item row (`GripVertical`, `cursor-grab`, `aria-hidden`); a 2 px ink line shows where it will land; the status line announces "Moved." for screen readers via the existing message.
- [x] Integration test (ownership, stale set refused, order written); e2e: drag an item below another and see the order after reload.
- [x] Commit `Let instructors drag sections and lessons into order`.

### Task 2: Resumable video uploads

- [x] `planUpload(size)` (16 MB parts, grown so parts ≤ 10,000), `partRange`, `missingParts`; unit tests.
- [x] aws: `createMultipartUpload(key, type)`, `signUploadPart(key, uploadId, n)`, `listUploadedParts(key, uploadId)` (paginated), `completeMultipartUpload(key, uploadId, parts)`, `abortMultipartUpload`.
- [x] Actions: `startResumableVideoUpload`, `signVideoUploadParts`, `resumeVideoUpload`, `finishResumableVideoUpload`, `cancelVideoUpload`; the target is a lecture (`itemId`) or a promo (`courseId`); guards reuse `mediaAssetMatchesUpload`.
- [x] Browser uploader with overall progress, per-part retry, a resume record in localStorage, Cancel.
- [x] Integration tests for the guards (not the owner, wrong target, too many parts, storage unset).
- [x] Commit `Upload videos in resumable parts`.

### Task 3: Promo video

- [x] Landing page tab "Promo video": status (processing / ready / failed), Upload / Replace / Remove; storage unset → plain note.
- [x] `getPromoPlayback(courseId)`; `VideoPlayer` `source: { kind: "lecture", itemId, slug } | { kind: "promo", courseId }`.
- [x] Course page: "Watch the promo" in the buy box when READY; dialog with the player, titled "Promo: {course}".
- [x] Integration test: who may play a promo; remove releases the asset.
- [x] Commit `Let instructors add a promo video to a course`.

### Task 4: Checks

- [x] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build, `ui-audit` + summary.
- [x] Progress log row; commit; push.
