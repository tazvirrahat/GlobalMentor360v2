# Features, plan 16: admin "view as" (read-only impersonation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec §12 "audited time-limited impersonation (security sensitive — confirm scope with the user before building)". Scope confirmed by the owner on 2026-09-27: **view-only**. An admin sees the site exactly as one person would, for at most 30 minutes; every write is blocked; start and stop are audited; a banner says so throughout; admins cannot be viewed as.

**Architecture:**

- **The grant is a cookie, not a session.** The admin keeps their own session. "View as" sets `gm360_view_as`: `{ admin, target, expires }` signed with HMAC-SHA256 under `BETTER_AUTH_SECRET`, httpOnly, `SameSite=Lax`, `Secure` in production, 30-minute max-age. `getCurrentUser()` honours it only when the real session's user is that admin, still an ACTIVE admin, the target is ACTIVE and not an admin, and it has not expired; then it returns the target, tagged `viewingAs`. Anything else ignores the cookie. Because every page, action and route already asks `getCurrentUser` / `requireUser` / `requireRole`, the whole app sees the target, and admin pages send the admin away until they stop (the target has no admin role).
- **Writes are blocked at the edge of the app.** `proxy.ts` (Next 16's replacement for middleware, Node runtime) answers any request that is not GET/HEAD/OPTIONS with 403 "Viewing as someone else is read-only" while an unexpired view-as cookie is present, except `POST /api/impersonation/stop` and sign-out. That covers every server action (they are POSTs) and every mutating route handler, including ones added later, without trusting each one to check. It fails closed: a tampered cookie only makes its holder read-only. The one read that used a server action, signed video playback, moves to GET routes (`/api/playback/lecture/<itemId>`, `/api/playback/promo/<courseId>`) so viewing a lesson still works; the player's progress reports fail quietly in this mode.
- **Audit.** `impersonation.start` (target, expiry) and `impersonation.stop` rows, actor = the admin.
- **Banner.** A second cookie, `gm360_view_as_label` (readable by script, display only: the person's name and the end time), lets a small client banner at the top of every page say "Viewing as {name}: view only, until 14:32" with Stop viewing (a plain form POST, works without script). It carries no authority; the signed cookie does.

**Tech Stack:** Next.js 16 proxy + route handlers + server actions, `node:crypto` HMAC, Vitest, Playwright.

## Global Constraints

- No schema change.
- Only ACTIVE admins start it; never for an admin, yourself, or a suspended account; one target at a time (starting again replaces it).
- Nothing the admin does while viewing can change data; stopping is always possible.

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/view-as-cookie.ts` (+ test) | create | encode / verify / read expiry (pure; the proxy uses only the expiry) |
| `lib/impersonation.ts` (+ integration test) | create | `canViewAs`, `startViewAs`, `stopViewAs`, `resolveViewAs` |
| `lib/session.ts` | modify | `getCurrentUser` returns the target with `viewingAs` |
| `proxy.ts` | create | read-only while viewing |
| `app/api/impersonation/stop/route.ts` | create | stop, audit, clear cookies, back to the user page |
| `app/(app)/admin/users/[userId]/…` | modify | "View as {name}" |
| `components/site/view-as-banner.tsx`, `app/layout.tsx` | create/modify | the banner |
| `app/api/playback/…`, `app/(learn)/learn/[slug]/video-player.tsx` | create/modify | playback over GET |

---

### Task 1: The grant and the block

- [x] Cookie helpers with unit tests (round trip, tampering, expiry).
- [x] `startViewAs` / `stopViewAs` / `resolveViewAs` with the guards and audit rows; integration tests.
- [x] `getCurrentUser` honours a valid grant.
- [x] `proxy.ts` blocks writes while a grant is live; allows stop and sign-out.
- [x] Playback over GET routes; the player uses them.
- [x] Commit `Let admins view the site as a learner, read-only`.

### Task 2: The admin control and the banner

- [x] Admin user page: "View as {name}" (hidden for admins, yourself, suspended accounts), with a line saying what it does.
- [x] Stop route; banner in the root layout.
- [x] e2e: admin views as the seed learner, sees their My learning, an attempted write is refused, Stop returns to the admin user page, and the audit rows exist.
- [x] Commit `Show who you are viewing as, with a way out`.

### Task 3: Checks

- [x] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build, `ui-audit` + summary.
- [x] Progress log row; `docs/PRODUCT-STATUS.md`; commit; push.
