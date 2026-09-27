# Features, plan 15: instructor replies, recency-weighted ranking, account preferences

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last of spec §12's partial items: "Instructor reply to a review (`review_responses` exists)", "Ratings: recency weighting in the aggregate (document the formula)", "Account preferences: timezone, language, notification preferences".

**Architecture:**

- **Instructor replies.** `review_responses` holds one reply per review. `lib/reviews.ts` gains `saveReviewResponse` / `deleteReviewResponse`, which only the course's instructor may call (1–2,000 characters); a new reply notifies the reviewer (`review_reply`). A Studio › Reviews page lists reviews of the instructor's courses, newest first, with "Needs a reply" / "All", and each review has Reply (or Edit / Delete of the reply). The course page shows the reply under its review as "Response from {instructor}".
- **Recency-weighted ranking.** `summariseRatings` keeps its flat mean on purpose (its comment explains why: the headline must match the histogram under it, and a time-weighted headline goes stale between writes). The weighting goes where it earns its keep, in ranking: a new `Course.ratingScore` is the recency-weighted mean `Σ wᵢ·rᵢ / Σ wᵢ` with `wᵢ = 0.5^(ageᵢ / 365 days)` (a review's weight halves each year; age from the review's last edit), computed in SQL inside `recomputeCourseRating` (same lock, same transaction) and by `npm run ratings:recompute` for a daily job, since the weights move with time. "Highest rated" sorts by `ratingScore`, then `ratingCount`. The formula is documented beside the SQL and in the progress log.
- **Account preferences.** A Preferences section on the account page:
  - *Time zone*: `users.timezone` becomes nullable, null meaning "the site's time zone" (the column's old `'UTC'` default was never chosen by anyone; the migration turns those rows into null). The date formatters in `lib/format.ts` take a time zone and default to the site's instead of the server's; pages pass the viewer's (`getViewerTimeZone()`, cached per request). Certificates and their PDF keep the site's time zone so a certificate reads the same for everyone.
  - *Notifications*: four booleans on `users` (all on by default): announcements in the app, announcements by email, replies to my questions, replies to my reviews. `notify` / `notifyMany` skip people who turned a type off; announcement emails skip those who turned email off. Enrollments, payments, refunds and course-review decisions always notify.
  - *Language*: not built. The interface is English only, so a language setting would change nothing; `users.locale` stays for when translations exist. Recorded in the progress log.

**Tech Stack:** Prisma 7 (one migration, `migrate deploy`), Next.js 16, Vitest, Playwright.

## Global Constraints

- Migration: additive columns plus the `timezone` nullability change; trimmed of `search_vector` drops; applied with `prisma migrate deploy`; `ratingScore` backfilled in the migration with the same formula.
- Only the course's instructor replies; admins moderate reviews (a hidden review's reply is hidden with it).
- Replies render as plain text (whitespace kept), like reviews.

## File map

| File | Change | Responsibility |
|---|---|---|
| `prisma/schema.prisma`, `prisma/migrations/…_reviews_preferences/` | modify/create | `Course.ratingScore`, `users` preferences, `timezone` nullable |
| `lib/reviews.ts` (+ tests) | modify | responses, `ratingScore` in the recompute, `recencyWeight` |
| `scripts/recompute-ratings.ts`, `package.json` | create/modify | `ratings:recompute` |
| `lib/courses.ts` | modify | "Highest rated" by score |
| `app/(app)/studio/reviews/page.tsx`, `review-reply.tsx`, `actions.ts`; `components/app/app-sidebar.tsx` | create/modify | Studio › Reviews |
| `components/site/review-list.tsx`, `app/(site)/courses/[slug]/page.tsx` | modify | the reply under its review |
| `lib/notifications.ts`, `lib/announcements.ts` | modify | preferences honoured |
| `lib/format.ts`, `lib/viewer-time.ts`, date call sites | modify/create | viewer time zone |
| `app/(site)/account/page.tsx`, `account-forms.tsx`, `actions.ts` | modify | Preferences section |
| `tests/integration/review-responses.test.ts`, `preferences.test.ts` | create | guards, notifications, score |

---

### Task 1: Instructor replies

- [ ] `saveReviewResponse(instructorId, reviewId, body)` (course owner only, 1–2,000 chars, upsert, notify on first reply), `deleteReviewResponse`.
- [ ] Studio › Reviews (sidebar "Reviews"): filter, paged 20, stars + author + date + text, reply form / edit / delete.
- [ ] Course page: reply under the review.
- [ ] Integration tests; e2e: the instructor replies and the course page shows it.
- [ ] Commit `Let instructors reply to reviews`.

### Task 2: Recency-weighted ranking

- [ ] Migration part: `ratingScore` with backfill.
- [ ] `recencyWeight(ageDays)` pure + test; SQL score in `recomputeCourseRating`; `recomputeAllCourseRatings()` + script.
- [ ] "Highest rated" sort uses the score.
- [ ] Integration test: an old 5 and a new 1 rank below a new 5 and an old 1.
- [ ] Commit `Rank courses by a recency-weighted rating`.

### Task 3: Account preferences

- [ ] Migration part: preferences and `timezone`.
- [ ] Formatters take a time zone (default: the site's); `getViewerTimeZone()`; call sites pass it (certificates keep the site's).
- [ ] Preferences section: time zone select (common zones first, then all), four notification checkboxes, Save.
- [ ] `notify` / `notifyMany` / announcement email honour the switches.
- [ ] Integration tests; e2e: turn off question replies, save, reload, still off.
- [ ] Commit `Add time zone and notification preferences`.

### Task 4: Checks

- [ ] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build, `ui-audit` + summary.
- [ ] Progress log row; commit; push.
