# Features, plan 9: instructor profiles and lecture resources

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec §12 "Missing entirely" items 1–3: a public instructor page at `/instructors/[slug]` with a studio editor for it, and per-lecture resources — external links, and downloadable files stored in S3 that only people allowed to open the lecture can download.

**Architecture:** Every profile field already exists on `User` (`slug`, `headline`, `bio`, `websiteUrl`, `profilePublic`), so the profile needs one data migration (fill `slug` for people who already teach) and code. Slugs are assigned when someone creates their first course and when they save their profile. `lecture_resources` already exists: a link is a row with `externalUrl`; a file is a row with a `storageKey` under `resources/…` in the same bucket as video originals. Uploads use a presigned PUT (like video); downloads go through one route that checks the same access rule as the player (`canAccessPlayerItem`) and redirects to a short-lived presigned GET with `Content-Disposition: attachment`. With AWS unset (local), the studio says file uploads need storage and still takes links.

**Tech Stack:** Prisma 7, Next.js 16 route handlers and server actions, `@aws-sdk/client-s3` + `s3-request-presigner` (already dependencies), Vitest, Playwright.

**Spec:** §12 items 1–3.

## Global Constraints

- The profile page shows only published courses and only when `profilePublic` is true and the person teaches at least one published course; anything else is a 404 (it does not confirm the account exists).
- A resource download is refused (404) unless the viewer can open that lecture in the player: enrolled, or the lecture is a free preview. The presigned URL lives 5 minutes.
- External links render with `rel="noopener noreferrer"` and open in a new tab, announced as such; only `https:` and `http:` URLs are accepted.
- Studio writes are scoped by course ownership, like every other curriculum write.
- Migrations: additive, trimmed of `search_vector`, applied with `prisma migrate deploy`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `prisma/migrations/…_instructor_slugs/` | create | fill `users.slug` for current instructors (collision-safe) |
| `lib/instructors.ts` (+ integration test) | create | `getInstructorProfile(slug)`, `ensureInstructorSlug(userId)`, `uniqueUserSlug(base)` |
| `lib/instructor-profile.ts` (+ test) | create | `parseProfileInput(fields)` headline ≤ 60, bio ≤ 2000, website http(s) |
| `lib/courses.ts` | modify | `listInstructorPublishedCourses(instructorId)` via the catalog row shape |
| `app/(site)/instructors/[slug]/page.tsx` (+ `not-found.tsx`) | create | public profile |
| `app/(site)/courses/[slug]/page.tsx` | modify | instructor name links to the profile |
| `app/(app)/studio/profile/page.tsx`, `profile-form.tsx`, `actions.ts` | create | studio editor |
| `components/app/app-sidebar.tsx` | modify | Studio: "Your profile" |
| `app/(app)/studio/actions.ts` | modify | `createCourse` calls `ensureInstructorSlug` |
| `prisma/seed.ts`, `seed-content.ts` | modify | Dana Instructor's slug, headline and bio |
| `lib/lecture-resources.ts` (+ test) | create | `parseResourceLink`, `resourceStorageKey`, `safeDownloadName` |
| `lib/storage.ts` | create | S3 presign PUT/GET + HEAD for resources, `isStorageConfigured()` |
| `app/(app)/studio/resource-actions.ts` | create | add link, start upload, finish upload, delete |
| `app/(app)/studio/courses/[courseId]/curriculum/[itemId]/resources-panel.tsx` | create | studio list + forms |
| `app/api/resources/[resourceId]/route.ts` + `lib/resource-access.ts` | create | access-checked download redirect (beside `/api/captions`, same `canAccessItemMedia` gate) |
| `app/(learn)/learn/[slug]/[itemId]/page.tsx` | modify | loads the lecture's resources (the page already enforces access) |
| `app/(learn)/learn/[slug]/[itemId]/page.tsx` | modify | Resources in the Overview tab |
| `tests/integration/lecture-resources.test.ts` | create | ownership on writes, access on downloads |

---

### Task 1: Instructor profile

**Interfaces:**

```ts
// lib/instructors.ts
export async function uniqueUserSlug(base: string): Promise<string>;              // "dana-instructor", then "-2", …
export async function ensureInstructorSlug(userId: string): Promise<string>;       // sets it once, returns it
export type InstructorProfile = {
  name: string; slug: string; headline: string | null; bio: string | null; websiteUrl: string | null;
  courseCount: number; learnerCount: number; ratingAverage: number | null; ratingCount: number;
  courses: CatalogCourse[];
};
export async function getInstructorProfile(slug: string): Promise<InstructorProfile | null>;

// lib/instructor-profile.ts
export function parseProfileInput(fields: { headline: string; bio: string; websiteUrl: string; profilePublic: boolean }):
  { ok: true; value: { headline: string | null; bio: string | null; websiteUrl: string | null; profilePublic: boolean } } | { ok: false; field: string; message: string };
```

- [x] Data migration: slug = slugified name for every user who authors a course and has no slug; duplicates get `-2`, `-3` by id order; empty names become `instructor`.
- [x] `getInstructorProfile`: rating is the review-count-weighted average of their published courses' aggregates; learners is the sum of `enrollmentCount`.
- [x] Page: initials avatar, h1 name, headline, facts (courses, learners, rating), About (paragraphs), website link, Courses (`CourseRow`, h3). Metadata from name + headline.
- [x] Course page: "Created by" and the Instructor section name link to `/instructors/[slug]` when the profile is public.
- [x] Studio "Your profile": headline, bio, website, "Show my profile page" checkbox; the public URL shown with a link once it exists. `createCourse` ensures a slug.
- [x] Seed: Dana Instructor gets a headline and bio.
- [x] Tests: `parseProfileInput` unit; `getInstructorProfile` integration (unpublished courses hidden, private profile 404, rating weighting); e2e: the course page links to the instructor page.
- [x] Commit `Add public instructor pages and a profile editor in the studio`.

### Task 2: Lecture resources

**Interfaces:**

```ts
// lib/lecture-resources.ts
export function parseResourceLink(title: string, url: string): { ok: true; value: { title: string; url: string } } | { ok: false; message: string };
export function resourceStorageKey(lectureId: string, fileId: string, filename: string): string; // resources/<lecture>/<id>/<safe-name>
export function safeDownloadName(filename: string): string;
export const RESOURCE_MAX_BYTES: number; // 100 MB

// lib/storage.ts
export function isStorageConfigured(): boolean;
export async function presignResourceUpload(key: string, contentType: string): Promise<{ url: string; headers: Record<string, string> }>;
export async function resourceObjectSize(key: string): Promise<number | null>;
export async function presignResourceDownload(key: string, filename: string): Promise<string>;
```

- [x] Studio actions (owner-scoped): `addResourceLink`, `startResourceUpload` (refuses when storage is not configured or the file is over the cap), `finishResourceUpload` (HEADs the object, stores the size), `deleteResource` (confirm in UI; deletes the S3 object best-effort).
- [x] Studio panel on the lecture editor: list (name, "Link" or size), add a link (title + URL), upload a file (progress like video) or a note that uploads need storage.
- [x] Download route: find resource → lecture → course; `canAccessPlayerItem`; redirect 302 to the presigned GET; 404 otherwise. Links never go through it.
- [x] Player Overview tab: "Resources" list (file: download icon, name, size; link: external icon, name, "opens in a new tab").
- [x] Tests: unit for the helpers; integration for owner-scoped writes and the download access decision.
- [x] Commit `Let instructors attach links and files to lectures`.

### Task 3: Checks

- [x] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build, `ui-audit` + summary (add `/instructors/[slug]` to the audit's public routes).
- [x] Progress log row; commit; push.
