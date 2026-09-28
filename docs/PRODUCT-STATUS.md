# GlobalMentor360v2 — product status

For the human owner. Written from the running codebase on 17 August 2026. README and this file should match; FEATURES.md is the wishlist, not the running app. No secrets in this file.

This is a **single Next.js app**. Admin is `/admin`. Studio is `/studio`. There is no Express server, no separate admin SPA, and no instructor marketplace.

---

## What this product is

GlobalMentor360v2 is a **single-organization online academy**. You own the content. Staff authors (role `INSTRUCTOR`) publish courses. Learners buy a course once and keep access until you refund it. There is no revenue share, no third-party sellers, and no all-access subscription.

| What people might assume | What it actually is |
|---|---|
| Udemy-style marketplace | One org. Instructors are staff you promote in `/admin/users`. |
| Separate admin site / Express API | Same Next.js 16 App Router app. APIs live under `app/api/`. |
| Subscription LMS | Per-course purchase. Access is an `Enrollment` row. |
| Instant bKash API | Manual transfer. The learner pays in the bKash app, then types the transaction ID here. You approve it. |

Roles that exist in the database: `LEARNER`, `INSTRUCTOR`, `ADMIN`, plus unused `SUPPORT` and `MODERATOR`. New sign-ups are always learners. You grant instructor/admin in `/admin/users`.

---

## How bKash access works

**Short answer to the question that started this:** you do **not** pick “this student + this course” in the admin panel. The learner checks out, sends bKash, and submits the transaction ID. You only Approve or Reject **that pending payment**. Access goes to **the account that submitted it**, for **the courses on that order**. Nothing else.

There is **no** admin screen to enroll an arbitrary user in an arbitrary course without a pending payment.

### The real path

```mermaid
sequenceDiagram
  participant L as Learner (signed in)
  participant App as This app
  participant BK as bKash app (out of band)
  participant A as Admin at /admin/payments

  L->>App: Cart /courses/[slug]/checkout
  App->>L: Amount to send (BDT, after coupon)
  L->>BK: Send that amount to your bKash number
  L->>App: Submit trx ID, their phone, date
  App->>App: Order PENDING + Payment PENDING_VERIFICATION
  Note over L: No access yet
  A->>A: Check trx in your own bKash portal
  alt Approve
    A->>App: Approve and enrol
    App->>L: Enrollment for payment.userId + each order item
  else Reject (reason required)
    A->>App: Reject
    App->>L: Order FAILED, still no access
  end
```

1. Learner must have an account and be signed in. Checkout is `/cart` (several courses) or `/courses/[slug]/checkout` (one course).
2. The amount they must send is computed on the server from the BDT price (and optional coupon). The browser cannot invent a cheaper total.
3. They pay in the **real bKash app**. This product never talks to bKash. There is no merchant API.
4. They submit: transaction ID, **their** bKash number, date, optional reference.
5. That creates a `PENDING` order and a `PENDING_VERIFICATION` payment. **No enrollment yet.**
6. You open `/admin/payments`. Each card already shows the learner (name + email), the course titles on that order, the amount, and the trx ID. Buttons are **Approve and enrol** and **Reject**.
7. Approve grants access with `grantEnrollment(payment.userId, each order course, "PURCHASE")` in the same database transaction that marks the payment complete. You cannot retarget the enrollment to someone else, and you cannot add a different course at approval time.
8. Reject requires a reason. The order becomes `FAILED`. Coupon reservation is released. Access is not granted.

The number learners send to comes from `BKASH_MERCHANT_NUMBER` in `.env`. When set, checkout and cart print it in the transfer instructions; while it is empty (it currently is), the copy says the payment number will be shared by the academy and to contact support — it never references a number it hasn't shown.

### What you are looking at in `/admin/payments`

- A queue of payments in `PENDING_VERIFICATION`. Empty means nothing to do.
- Not a user picker. Not a course picker.
- Approve is the manual equivalent of a Stripe webhook: money confirmed → access for **that** buyer, **those** courses.

### Other ways access is granted (still not a picker)

| Path | Who starts it | Admin involved? | Enrollment source |
|---|---|---|---|
| bKash, amount > 0 | Learner submits trx ID | Yes — Approve | `PURCHASE` |
| 100% coupon (quote total 0) | Learner applies a code at cart or course checkout | No. `fulfillZeroTotalQuote` enrolls immediately | `PURCHASE` |
| Free course (every active price is 0) | Learner clicks Enrol for free (landing or cart) | No | `FREE` |
| Stripe card | Learner pays on Stripe Checkout | No, if keys + webhook are set | `PURCHASE` |
| Seed | `npm run db:seed` | No | `GRANT` (sample learner only) |

| Admin gives a course | Admin, from `/admin/users/<id>` → Give a course | Yes (audited `enrollment.grant`) | `GRANT` |

`grantEnrollment(..., "GRANT")` is the same function every rail uses; the admin user page calls it for published courses the person does not already have.

### Refunds — also not a picker

`/admin/refunds` lists **paid orders**. You refund the whole order. That revokes enrollment for **that buyer** on **every course on that order**. The product does not send money back through Stripe or bKash; you return cash out of band. The learner is notified in-app.

### What the learner sees while waiting

- After submit: “awaiting verification” on checkout / cart.
- `/orders` and `/orders/[orderId]` show order status (`PENDING` / `PAID` / `FAILED` / `REFUNDED`).
- On approve: in-app notification, receipt email (if email transport works), `/dashboard` shows the course.
- Reject reason is stored (`verificationNotes`) but **not shown** on the learner receipt page.

### Seed accounts (local only)

Identify them by **email**. Password for all three: `dev-password-12345`. Re-seed finds the existing row by email and does **not** rename `User.name`; do not rename those database users to match a certificate or admin card.

| Email | Role | What they already have |
|---|---|---|
| `learner@example.com` | learner | Enrolled in **TypeScript Foundations** (seeded as `GRANT`) |
| `instructor@example.com` | learner + instructor | Owns the two sample courses |
| `admin@example.com` | learner + admin | `/admin` |

To practise the bKash queue: sign in as `learner@example.com`, buy **SQL for Analysts** (they are not enrolled in that one), submit a fake trx ID, then approve as `admin@example.com`.

Seed coupon: `SAVE10` (10% off). A 100% coupon would skip the queue entirely.

---

## Features that are in

Grouped by what you can actually click today.

### Catalog and auth

- Public home, catalog `/courses` with search (Postgres full-text on generated `courses.search_vector`, plus trigram/ILIKE), filters (level, category, price free/paid, rating, language), sort. That column is created by a SQL migration, not `schema.prisma` — `npm run db:push` drops it.
- Course landing: objectives, requirements, audience, curriculum outline, instructor name, reviews + histogram, free-preview link when an item is flagged preview.
- Email/password sign-up and sign-in (Better Auth). Email must be verified before a session exists. Password reset, change email, change password, list/revoke other sessions: `/account`.
- Min password length 12. Seed accounts skip verification (`emailVerified` set in seed).

### Payments

- **bKash manual** — always available when a course has an active BDT price. Cart + single-course checkout. Coupons apply here. Transfer instructions show `BKASH_MERCHANT_NUMBER` when set.
- **Stripe** — shown on **single-course** checkout only, when `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set and the course has a USD price. Instant access via `/api/webhooks/stripe`. No cart, no coupons on this rail.
- **Displayed price is bKash-first**: catalog/landing/course pages show the BDT price when one exists, so the headline matches what checkout charges. A published paid course with no BDT price while Stripe is unconfigured is flagged as unpayable in studio settings and `/admin/courses`.
- Free enroll for price-0 courses.
- Cart `/cart`: mix free + paid; free enrolls immediately; paid goes through bKash (or 100% coupon).
- Order history `/orders`, receipt page, receipt email after bKash approval.
- Admin refund + revoke: `/admin/refunds`.

### Learning

- Player `/learn/[slug]/[itemId]`: video (HLS), article, audio and PDF lectures, quizzes. Lecture resources (links and files) in the Overview tab. Transcript tab (from uploaded captions) with click-to-seek.
- Sequential unlock: later required items stay locked until earlier ones are complete. Preview items stay playable even when locked for enrolled sequence.
- Video: signed CloudFront URL, speed 0.75×–2× and quality (HLS levels) remembered in the browser, resume position, ~15s progress reports, "Autoplay next lesson" (on by default; a 5-second countdown with Cancel). Lecture counts complete at 90% watched.
- Quiz: single choice, multi-select, true/false; pass threshold default 70%; explanations after attempt. Empty quizzes auto-pass (studio warns before publish).
- Notes (timestamp + body) and per-lesson bookmarks — enrolled learners only, in the player.
- Captions: uploaded VTT, native `<track>` in the player.
- Course Q&A (per lecture or whole course) in the player; instructor can reply; instructor badge.
- Announcements in the player (latest 20).
- Reviews: enrolled learners, 1–5 stars + optional text, editable by the author. Admin can hide/restore. Instructors reply from `/studio/reviews`; the reply shows under the review. "Highest rated" ranks by a recency-weighted score (a review's weight halves each year); the displayed average stays the plain mean.
- Progress % on `/dashboard` (in progress / completed / archived, with Archive buttons). Certificate issued at 100%. Public verify page `/certificates/[serial]` and PDF download `/certificates/[serial]/pdf`.
- In-app notification bell (enrollment, payment, Q&A reply, review reply, announcement, course review). Account › Preferences: time zone for dates, and switches for announcements (app / email), question replies and review replies.

### Studio (`/studio`)

Staff with `INSTRUCTOR` or `ADMIN`. Header link “Studio”.

- Create course (starts `DRAFT`). Instructors who are not admins **submit for review**; an admin approves (publishes) or returns it with a note from `/admin/courses`.
- Settings: title, subtitle, description, category, course image, objectives/requirements/audience, FAQ, promo video, level, language, **one price currency at a time** (set BDT or you cannot sell via bKash), publish (or submit for review) with a readiness checklist.
- Curriculum: sections, add lecture or quiz, reorder (buttons, or drag by the grip with a mouse), delete, toggle **Preview**.
- Lecture: article body, video upload (resumable S3 multipart → MediaConvert → HLS), or an audio file / PDF; links and files as resources. Status refresh + SQS drain on curriculum pages.
- Quiz builder: questions, options, explanations, pass threshold, time limit.
- Caption upload (WebVTT) per video.
- Q&A inbox `/studio/qa`; reviews with replies `/studio/reviews`; per-course Analytics (enrollments by week, completion, rating by month, where learners stop); public instructor page edited at `/studio/profile`.
- Announcements `/studio/announcements` (email + in-app; refuses above 500 recipients until a queue exists).
- Coupons `/studio/coupons` (course-scoped; sitewide codes are admin-created). Apply at **bKash** checkout.

### Admin (`/admin`)

Same app. `/admin` redirects to payments.

| Page | What it does |
|---|---|
| `/admin/payments` | Approve/reject pending bKash. This is how paid bKash access is granted. |
| `/admin/refunds` | Mark a paid order refunded and revoke those enrollments. |
| `/admin/users` | Search users; grant/remove `INSTRUCTOR` and `ADMIN`. Each user's page: suspend/unsuspend (signs them out; sign-in then says the account is suspended) and Give a course. |
| `/admin/courses` | Search; publish/unpublish; the review queue (approve / return with a note). Each course's page: feature on the home page, category, topics and skills. |
| `/admin/reviews` | Hide/restore reviews. |
| `/admin/taxonomy` | Categories (subjects and subcategories), topics, skills. |
| `/admin/videos` | Videos by status, failed or stuck ones with Retry / Check status, the event queue's last drain. |

**View as (read-only):** from a user's page, "View as {name}" shows the whole site as that person for up to 30 minutes. Every change is blocked while viewing (the app refuses any request that could write), a banner at the top says who you are viewing and until when, and Stop viewing returns you to their page. Admins and suspended accounts can't be viewed as. Start and stop are recorded in the audit log.

### Video / AWS

- Provider is AWS (`lib/video/index.ts` → `awsProvider`). Pipeline: browser PUT to S3 → MediaConvert HLS → CloudFront signed playback.
- **Signing is on** in code (`signPlaybackUrl` with the CloudFront key group). Local keys are already expected in your `.env` (do not paste them into chat).
- **SQS refresh is on:** EventBridge writes MediaConvert COMPLETE/ERROR to the queue named in `AWS_VIDEO_EVENT_QUEUE_URL`. Studio “Check status” and opening the curriculum list short-poll that queue (and S3 HeadObject still detects READY).
- **HTTP webhook waits for a public domain:** `POST /api/video/webhook` with `x-webhook-secret`. AWS cannot reach `localhost`. Do not create the EventBridge Connection until you have HTTPS (it stores the secret in Secrets Manager even if unused).

---

## Course features (notes etc.)

What a published course can have, and where.

| Capability | Learner | Studio (author) | Admin |
|---|---|---|---|
| Curriculum: video lecture | Watch in `/learn/...` (signed HLS) | Upload + status | — |
| Curriculum: article lecture | Read in player | Edit body | — |
| Curriculum: quiz | Take in player | Quiz builder | — |
| Practice test / assignment / coding exercise | Not rendered | Cannot add (enum reserved) | — |
| Sequential unlock | Locked until prior required items complete | Implicit; empty quiz warning | — |
| Free preview | Playable signed-out; linked from landing | Eye toggle per item | — |
| Notes | Player, enrolled only | — | — |
| Bookmarks | Player, enrolled only | — | — |
| Captions | On/off in video player | Upload VTT | — |
| Auto-generated captions | Not built | Not built | — |
| Transcript | Transcript tab (from uploaded captions) | Upload VTT | — |
| Lecture resources (links, files) | Overview tab | Resources panel | — |
| Course image / promo video | Image in lists and the buy box; "Watch the promo" | Details / Landing page fields | — |
| Progress % | Dashboard + player | Enrollment count on studio list | — |
| Reviews + histogram | Landing page | — | Hide/restore |
| Instructor reply to a review | Under the review | `/studio/reviews` | — |
| Q&A | Player | `/studio/qa` | — |
| Q&A upvote / search | Not built | Filter unanswered / course / date | — |
| Announcements | Player + email | Composer | — |
| Certificate | Dashboard, player banner, public URL, PDF | Counts toward completion | No reissue UI |
| Wishlist | Not built (skipped) | — | — |
| Archive course on dashboard | Archive / Unarchive buttons | — | — |

Playback extras that are **not** in: picture-in-picture UI, keyboard shortcut overlay, DRM, watermarking, captions on promo videos.

---

## Left for YOU (cannot be done in code alone)

These need an account, a dashboard, or a decision from you. Do not paste keys, PEM files, or webhook secrets into chat.

1. **Public domain + video webhook.** Local playback and SQS drain already work. Production auto-refresh of FAILED/COMPLETE without opening studio needs HTTPS so EventBridge can `POST /api/video/webhook`. Until then, authors refresh status in studio.
2. **Transactional email to real inboxes.** The app sends through **AWS SES** when `EMAIL_FROM` and the AWS keys are set; otherwise it prints the email to the **dev server console**. SES **production access was denied**, so you cannot mail arbitrary addresses from SES until that changes. **This blocks real sign-ups in production**: verification is required before sign-in, and in production the app refuses the console fallback — so a deploy without working email lets people register into accounts they can never verify or use. The server now logs a `[readiness]` warning at startup in production when the email env is missing. Options: stay in SES sandbox (verified recipients only), retry AWS production access, or use **Resend** (or similar) — that last option is a code change plus an API key, not something this file can flip.
3. **Stripe**, only if you want cards. Create a Stripe account, put the three keys in `.env`, run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` locally. Without them the card block hides itself. Coupons still will not apply on Stripe until that rail is extended.
4. **Social login apps** (Google / etc.), only if you want them. Better Auth has email/password only today. You would create OAuth apps at each provider and then the product has to be wired.
5. **CloudFront** is already set on this machine locally (signing keys in `.env`). Keep them out of git. Rotate if they were ever committed in the old prototype.
6. **Your real bKash personal/merchant number** goes in `BKASH_MERCHANT_NUMBER` in `.env` (currently empty). Once set, checkout and cart show it in the transfer instructions; until then they tell learners the number will be shared by the academy / contact support.
7. **GitHub is behind.** Local `main` is **27 commits ahead** of `origin/main`. There is also **uncommitted** work on disk (cart, admin users/refunds, captions, notes, coupons, etc.). A push without a commit does not upload that working tree. Push only when you intend GitHub to match this machine.
8. **Production host** (domain, HTTPS, Postgres not on your laptop, `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` pointing at the public origin). Local docker Postgres is not the internet.
9. **A daily job for ratings.** "Highest rated" uses a recency-weighted score whose weights move with the date. Schedule `npm run ratings:recompute` once a day on the host (it is safe to run any time).
10. **S3 bucket settings for uploads.** The bucket's CORS rule must allow `PUT` from the app's origin (video parts, resource files, course images, audio/PDF lessons all upload straight from the browser). Add a lifecycle rule that aborts incomplete multipart uploads after a few days, so abandoned video uploads do not keep costing storage.

---

## Left in the product (optional / not built)

Honest leftovers. None of these are required to sell a course via bKash if you approve payments by hand.

**Not built — people often assume they exist**

- **Retargeting a bKash approval to another account.** An admin can give the right account the course (`/admin/users/<id>` → Give a course) and refund the wrong one, but an approval itself cannot be moved.
- **Learner-visible reject reason.** Admin must type one; receipts do not show it.
- **Wishlist** — skipped on purpose.
- **Stripe on the cart, and Stripe coupons.** Cart is bKash-only. Stripe is one course, list USD price.
- **Social login** — sign-in page is email/password only.
- **Separate admin SPA** — do not build one; `/admin` is in this app.
- **Express split** — do not do this. `npm run verify:apis` already states there is no Express server.
- **bKash PGW (automatic API)** — FEATURES P2; needs a merchant account and a new rail.
- **Self-serve 30-day refund request** — only admin refunds.
- **EventBridge HTTPS API destination** — code is ready; origin is not.

**Schema or files that look finished but have no product UI**

- Practice tests, assignments, assignment submissions, coding-exercise enum value.
- `review_votes`, `content_reports`.
- `UserStatus.DELETED` — no delete-account flow.
- Roles `SUPPORT`, `MODERATOR` — unused.
- Certificate `pdfKey` — unused; PDF is generated on the fly.
- `lib/video/bunny.ts` — leftover previous vendor; not selected.
- `users.locale` — kept for when the interface is translated; there is no language setting yet.
- TECH-SPEC extras not in the app: Redis, BullMQ, PostHog, i18n, GDPR export/erasure, 2FA, SSO, native apps, mentorship/live class.

**Partial / capped**

- Announcement email: max 500 recipients per send.
- Studio price form: one currency per save (USD and BDT can both exist; you set them separately). A course with only USD cannot be bought with bKash.
- Keyboard shortcut help, note export.

---

## How to run locally

Needs Docker Desktop for Postgres. Do not commit `.env`.

```bash
npm install
cp .env.example .env
# set BETTER_AUTH_SECRET (npx @better-auth/cli secret)
docker compose up -d
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev
```

Use `npm run db:migrate`, not `npm run db:push`. `db:push` syncs the database to `schema.prisma` and **drops** `courses.search_vector` (generated tsvector + GIN indexes from the catalog-search SQL migration). Catalog full-text search then fails until you re-apply that migration.

App: http://localhost:3000  
Postgres: `postgresql://postgres:postgres@localhost:5432/globalmentor360` (local docker only).

| Check | Command |
|---|---|
| HTTP inventory (app must be running) | `npm run verify:apis` |
| Unit tests | `npm run test` |
| DB integration tests | `npm run test:db` (Postgres up) |

Sign in with the seed emails above (not by display name). Walk the bKash path on **SQL for Analysts**, then `/admin/payments` as `admin@example.com`. That admin page is a payment queue, not a student picker.

Stripe and AWS video are optional for that walkthrough. If AWS keys are in local `.env`, studio upload and signed playback work without any further paste into chat.
