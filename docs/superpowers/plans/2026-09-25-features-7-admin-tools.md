# Features, plan 14: suspend, grant a course, feature on the home page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec §12 "Admin users: suspend/unsuspend (uses `UserStatus`), grant course without payment (`grantEnrollment(..., "GRANT")`, audited)" and "Admin courses: feature/pin on home". Impersonation is not in this plan: it waits for the owner's confirmation of scope (spec §12, §13).

**Architecture:**

- **One user's admin page** at `/admin/users/[userId]`, linked from the Users table: name, email, roles (the existing role toggles), status, enrollments, and two actions. The Users table stays a list.
- **Suspend / unsuspend** writes `User.status` through `setUserStatus` in `lib/admin.ts` (audited `user.suspend` / `user.unsuspend`). Suspending deletes the person's sessions, so they are signed out at once; `getCurrentUser` already treats a non-ACTIVE account as signed out. A better-auth `session.create.before` hook refuses new sessions for a non-ACTIVE account with "This account is suspended. Contact support.", so sign-in says why instead of silently not working. An admin cannot suspend themselves or the last active admin.
- **Grant a course** calls `grantEnrollment(userId, courseId, "GRANT")` (the only write that opens a course, invariant 7) from `grantCourse` in `lib/admin.ts`, which checks the course is published, refuses a duplicate active enrollment, and audits `enrollment.grant` with the admin as actor. The picker lists published courses the person does not have.
- **Feature on the home page**: a nullable `Course.featuredAt` (additive migration). The admin course page gets "Feature on the home page" / "Stop featuring" (audited `course.feature`). The home page's course list shows featured published courses first (newest feature first), then fills with the most popular.

**Tech Stack:** Prisma 7 (one additive migration, `migrate deploy`), better-auth database hooks, Next.js 16 server actions, Vitest, Playwright.

## Global Constraints

- Every write is ADMIN-only and audited.
- Unpublishing a featured course keeps `featuredAt` but the home page only shows published courses.
- Migration trimmed of the `search_vector` / trigram drops, applied with `prisma migrate deploy`; the dev server restarts after `prisma generate`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `prisma/schema.prisma`, `prisma/migrations/…_course_featured/` | modify/create | `Course.featuredAt` |
| `lib/admin.ts` | modify | `getAdminUser`, `setUserStatus`, `grantCourse`, `setCourseFeatured` |
| `lib/auth.ts` | modify | refuse sessions for non-ACTIVE accounts |
| `app/(app)/admin/users/[userId]/page.tsx`, `user-actions.tsx`, `../../actions.ts` | create/modify | the user page |
| `app/(app)/admin/users/page.tsx` | modify | names link to the user page; status column |
| `app/(app)/admin/courses/[courseId]/page.tsx` | modify | feature toggle |
| `lib/courses.ts`, `app/(site)/page.tsx` | modify | featured first on the home page |
| `tests/integration/admin-users.test.ts`, `course-featured.test.ts` | create | guards, sessions, audit, ordering |

---

### Task 1: Suspend and grant

- [ ] `setUserStatus(actorId, userId, "ACTIVE" | "SUSPENDED")`: not yourself, not the last active admin; deletes sessions on suspend; audit.
- [ ] `session.create.before` hook throws `APIError("FORBIDDEN")` with the suspended message for a non-ACTIVE user.
- [ ] `grantCourse(actorId, userId, courseId)`: published course, no active enrollment, `grantEnrollment(..., "GRANT")`, audit.
- [ ] `/admin/users/[userId]`: overview, roles, status with Suspend (asks first) / Unsuspend, enrollments (course, source, date), "Give a course" form.
- [ ] Integration tests; e2e: admin suspends a fresh account, it cannot sign in and sees why; unsuspend; grant a course and the learner sees it in My learning.
- [ ] Commit `Let admins suspend accounts and give courses`.

### Task 2: Feature on the home page

- [ ] Migration; `setCourseFeatured(actorId, courseId, featured)`; admin course page toggle.
- [ ] `listHomeCourses(limit)`: featured published first, then popular, no duplicates.
- [ ] Integration test for the order; e2e: feature a course and it leads the home list.
- [ ] Commit `Let admins feature courses on the home page`.

### Task 3: Checks

- [ ] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build, `ui-audit` + summary (the user page added to the audit).
- [ ] Progress log row; commit; push.
