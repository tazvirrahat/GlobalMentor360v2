# Features, plan 11: course analytics, taxonomy, video job monitoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec §12 "Missing entirely" items 4–6 and "Admin courses: edit taxonomy". Instructors get an Analytics section per course (enrollments over time, completion, rating trend, where learners stop). Admins get a taxonomy editor (categories, topics, skills), a per-course admin page that sets a course's category, topics and skills, and a Videos page that shows the processing pipeline (assets by status, failures with their reason, retry, the SQS drain).

**Architecture:** Analytics read the durable tables, not the event stream: `enrollments.enrolledAt` for enrollments over time, `course_progress.completedAt` for completion, `reviews` for the rating trend, `item_progress` for per-item reach. `analytics_events` only records three event names today (`enrollment_granted`, `lecture_completed`, `quiz_submitted`) and events can be dropped by design (`recordEvent` never throws), so counting from it would undercount; the tables are the source of truth. All queries live in `lib/course-analytics.ts` and are bucketed in the site's time zone (`Asia/Dhaka`, from `lib/site.ts`). Charts are tables with inline bars: the numbers are the content, the bars are `aria-hidden` decoration, so screen readers and phone widths get the same information with no chart library.

Taxonomy writes live in `lib/taxonomy.ts` (slug from name, unique; categories two levels deep; a category with courses or children cannot be deleted; deleting a topic or skill removes its course links, which the confirm says). Topics and skills become visible: the course page shows "Skills you'll gain" and "Related topics" (links to a catalog search for the topic). The course editor's Details tab gets the Category select the new-course dialog already has.

Video monitoring lives in `lib/video-jobs.ts`: counts by `MediaStatus`, the assets needing attention (FAILED; PROCESSING or UPLOADING for over an hour), each with its lecture, course and instructor. Retry re-runs `video.startProcessing` for a FAILED asset whose original is still in S3 and audits `video.retry`; Check status reuses the provider's `getAsset` reconcile. The SQS drain records its last run (time, events applied, error) in memory per server, shown with a "Drain now" button; the page says it is per server.

**Tech Stack:** Prisma 7 (`$queryRaw` for the bucketed counts; no migration), Next.js 16 server components and actions, Vitest, Playwright.

## Global Constraints

- Analytics are the course owner's only (404 otherwise, like every studio page). Numbers count active enrollments (`revokedAt IS NULL`); refunded learners drop out.
- Percentages floor, like progress elsewhere (a 99.6% completion is not "100%").
- Weeks are ISO weeks (starting Monday), labelled by their first day ("8 Sep"), in `Asia/Dhaka`.
- Taxonomy and video actions are ADMIN only and audited (`taxonomy.*`, `video.retry`, `course.taxonomy`).
- Slugs are unique per table; a rename keeps the slug (links keep working).
- No schema change.

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/course-analytics.ts` (+ integration test) | create | `getCourseAnalytics(courseId)` |
| `lib/analytics-weeks.ts` (+ test) | create | `weekStarts(now, count, timeZone)`, `weekLabel` (pure) |
| `app/(app)/studio/courses/[courseId]/analytics/page.tsx` | create | figures, enrollments by week, rating by month, reach per item |
| `components/app/bar-table.tsx` | create | a table row's inline bar (decorative) |
| `components/app/course-editor-nav.tsx`, `lib/course-editor.ts` | modify | "Analytics" section |
| `lib/taxonomy.ts` (+ integration test) | create | category/topic/skill CRUD, `setCourseTaxonomy` |
| `app/(app)/admin/taxonomy/page.tsx`, `taxonomy-forms.tsx`, `actions.ts` | create | the editor |
| `app/(app)/admin/courses/[courseId]/page.tsx`, `taxonomy-form.tsx` | create | one course: status, instructor, taxonomy |
| `app/(app)/admin/courses/page.tsx` | modify | course titles link to their admin page |
| `app/(app)/studio/courses/[courseId]/course-editor.tsx`, `page.tsx`, `../../actions.ts` | modify | Category on Details |
| `lib/courses.ts`, `app/(site)/courses/[slug]/page.tsx` | modify | skills and topics on the course page |
| `lib/video-jobs.ts` (+ integration test) | create | `videoStatusCounts`, `listVideoJobsNeedingAttention`, `retryVideoProcessing` |
| `lib/video/aws.ts` | modify | remembers the last drain |
| `app/(app)/admin/videos/page.tsx`, `video-job-actions.tsx`, `../actions.ts` | create | the monitor |
| `components/app/app-sidebar.tsx` | modify | Admin: Taxonomy, Videos |
| `scripts/ui-audit/ids.mjs` | modify | audit the new pages |

---

### Task 1: Course analytics

**Interfaces:**

```ts
// lib/course-analytics.ts
export type CourseAnalytics = {
  learners: number;               // active enrollments
  completed: number;              // of those, course_progress.completedAt set
  enrolledLast30Days: number;
  ratingAverage: number | null; ratingCount: number;
  weeks: { start: string; label: string; enrollments: number }[];            // last 12 ISO weeks, oldest first
  ratingMonths: { month: string; label: string; average: number | null; count: number }[]; // last 6 months
  items: { id: string; title: string; type: string; sectionTitle: string; started: number; completed: number }[]; // curriculum order
};
export async function getCourseAnalytics(courseId: string, now?: Date): Promise<CourseAnalytics>;
```

- [ ] Pure week helpers with unit tests (Dhaka midnight boundaries, year rollover).
- [ ] Queries: one grouped count per series (`date_trunc('week', "enrolledAt" AT TIME ZONE 'Asia/Dhaka')`), zero-filled in code.
- [ ] Page: four figures (Learners, Completed with %, New in the last 30 days, Rating); "Enrollments by week" and "Rating by month" as tables with bars; "Where learners stop": each item's reached % and completed %, with the largest drop between consecutive items called out in a sentence. Empty course: one plain empty state.
- [ ] Editor nav gains "Analytics" (a route like Curriculum).
- [ ] Integration test: counts, revoked excluded, zero-filled weeks, per-item reach order; e2e: the instructor opens Analytics for the seed course.
- [ ] Commit `Show instructors how their courses are doing`.

### Task 2: Taxonomy

**Interfaces:**

```ts
// lib/taxonomy.ts
export type TaxonomyResult = { ok: true } | { ok: false; message: string };
export async function createCategory(adminId: string, input: { name: string; parentId: string | null }): Promise<TaxonomyResult>;
export async function renameCategory(adminId: string, id: string, name: string): Promise<TaxonomyResult>;
export async function moveCategory(adminId: string, id: string, direction: "up" | "down"): Promise<TaxonomyResult>;
export async function deleteCategory(adminId: string, id: string): Promise<TaxonomyResult>; // refused with courses or children
export async function createTag(adminId: string, kind: "topic" | "skill", name: string): Promise<TaxonomyResult>;
export async function renameTag(adminId: string, kind: "topic" | "skill", id: string, name: string): Promise<TaxonomyResult>;
export async function deleteTag(adminId: string, kind: "topic" | "skill", id: string): Promise<TaxonomyResult>;
export async function setCourseTaxonomy(adminId: string, courseId: string, input: { categoryId: string | null; topicIds: string[]; skillIds: string[] }): Promise<TaxonomyResult>;
```

- [ ] Names 2–60 characters; duplicate names (case-insensitive, same parent for categories) refused; slug from name with `-2`… on collision.
- [ ] Admin › Taxonomy: Categories (each subject with its subcategories, course counts, rename, up/down, delete when empty; add a subject or a subcategory), Topics and Skills (name, course count, rename, delete with "removes it from N courses"; add).
- [ ] Admin course page `/admin/courses/[courseId]`: title, instructor, status, learners, Publish/Unpublish, and a Taxonomy form (category select, topic and skill checkboxes). The Courses table links each title there.
- [ ] Studio Details tab: Category select; `updateCourse` saves it when the field is present.
- [ ] Course page: "Skills you'll gain" (list) and "Related topics" (links to `/courses?q=<topic>`), each only when non-empty.
- [ ] Integration tests (guards, slugs, audit rows, course links); e2e: admin adds a topic and assigns it to a course, the course page shows it.
- [ ] Commit `Add a taxonomy editor and let admins tag courses`.

### Task 3: Video job monitoring

**Interfaces:**

```ts
// lib/video-jobs.ts
export async function videoStatusCounts(): Promise<Record<MediaStatus, number>>;
export type VideoJob = { id: string; status: MediaStatus; failureReason: string | null; createdAt: Date; updatedAt: Date;
  lecture: { itemId: string; title: string; courseId: string; courseTitle: string; instructorName: string } | null };
export async function listVideoJobsNeedingAttention(now?: Date): Promise<VideoJob[]>; // FAILED, or PROCESSING/UPLOADING older than 1 h
export async function retryVideoProcessing(adminId: string, assetId: string): Promise<{ ok: true } | { ok: false; message: string }>;

// lib/video/aws.ts
export function lastDrain(): { at: Date; applied: number; error: string | null } | null;
```

- [ ] Admin › Videos: four status figures; "Needs attention" table (lecture and course, instructor, status with age, the failure reason in full); per row Retry (FAILED) and Check status; "Event queue" panel: configured or not, last drain on this server, Drain now.
- [ ] With AWS unset, actions say "Video processing isn't set up on this site." rather than failing.
- [ ] Integration tests for counts, the attention filter, retry guards; e2e: admin opens Videos.
- [ ] Commit `Let admins watch and retry video processing`.

### Task 4: Checks

- [ ] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build, `ui-audit` + summary (new pages added to the audit).
- [ ] Progress log row; commit; push.
