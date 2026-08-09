# GlobalMentor360 — Technical Spec

Companion to [FEATURES.md](FEATURES.md). Covers the data model, stack, build sequencing, and
verification strategy.

## Data Model

PostgreSQL, single schema, `snake_case` tables, UUIDv7 primary keys.

### Identity

- `users` — email, password_hash, name, headline, bio, avatar_url, locale, timezone, status
- `roles`, `user_roles` — many-to-many
- `sessions`, `oauth_accounts`, `email_verifications`, `password_resets`

### Catalog

- `categories` — self-referencing `parent_id` for subcategories
- `topics`, `skills`
- `courses` — title, slug, subtitle, description, level, language, status,
  primary_category_id, instructor_id, promo_video_id, thumbnail_url, published_at
- `course_objectives`, `course_requirements`, `course_target_audience` — ordered text rows
- `course_topics`, `course_skills` — join tables
- `sections` — course_id, title, position
- `curriculum_items` — section_id, position, `type` enum
  (`lecture` | `quiz` | `practice_test` | `assignment` | `coding_exercise`), title, is_preview
- `lectures` — curriculum_item_id, content_type (`video`|`article`|`audio`|`file`),
  asset_id, article_body, duration_seconds
- `lecture_resources` — lecture_id, filename, storage_key, size, is_downloadable

### Media

- `media_assets` — original_key, status (`uploading`|`processing`|`ready`|`failed`),
  playback_id, duration, provider
- `captions` — asset_id, language, vtt_key, source (`uploaded`|`asr`|`translated`)
- `transcripts` — asset_id, language, cues (JSONB)

### Assessment

- `quizzes`, `practice_tests` — curriculum_item_id, settings (time_limit, pass_threshold, shuffle)
- `questions` — parent_id, parent_type, prompt, type, explanation, knowledge_area, position
- `answer_options` — question_id, text, is_correct, explanation
- `assignments` — curriculum_item_id, instructions, duration_estimate, solution_body
- `assignment_submissions` — assignment_id, user_id, body, attachments, status, feedback
- `quiz_attempts` — user_id, quiz_id, started_at, submitted_at, score
- `quiz_attempt_answers` — attempt_id, question_id, selected_option_ids, is_correct

### Learning

- `enrollments` — user_id, course_id, source (`purchase`|`grant`|`free`), enrolled_at, archived_at
  — a `subscription` source value is deliberately reserved but unused; see
  [invariant 1](#invariants)
- `item_progress` — user_id, curriculum_item_id, completed_at, last_position_seconds, watched_seconds
- `course_progress` — rollup: user_id, course_id, percent, completed_at
- `notes` — user_id, lecture_id, timestamp_seconds, body
- `bookmarks` — user_id, curriculum_item_id
- `certificates` — user_id, course_id, serial, issued_at, pdf_key

### Engagement

- `reviews` — user_id, course_id, rating, body, status; unique on (user_id, course_id)
- `review_responses` — review_id, responder_id, body
- `review_votes` — review_id, user_id, is_helpful
- `question_threads` — course_id, lecture_id (nullable), user_id, title, body, upvotes
- `thread_replies` — thread_id, user_id, body, is_instructor
- `announcements` — course_id, author_id, body, sent_at
- `notifications` — user_id, type, payload (JSONB), read_at
- `content_reports` — reporter_id, target_type, target_id, reason, status

### Commerce

- `prices` — course_id, currency, amount, is_active
- `carts`, `cart_items`
- `orders` — user_id, status, subtotal, discount, tax, total, currency, provider_ref
- `order_items` — order_id, course_id, unit_price, discount_applied
- `coupons` — code, type, value, scope, max_redemptions, valid_from/until
- `coupon_redemptions` — coupon_id, user_id, order_id
- `refunds` — order_item_id, amount, reason, status

### Payment rails

Checkout talks to `lib/payments/rail.ts`, not to a provider. Two rail shapes exist
because they genuinely differ:

| | Automatic | Manual |
|---|---|---|
| Money arrives | inside our checkout | out-of-band, learner pays in their own app |
| Confirmation | provider callback, signature-verified | an admin checks and approves |
| Access | instant | waits for a human |
| Admin queue | not needed | required, and it is P0 |

**Only the manual rail is implemented.** `bkashManualRail` records what the learner
claims and nothing else — no code in this project contacts bKash. There is
deliberately **no stub** for the bKash PGW API: an empty class that looks
implemented is the failure recorded in
[PRIOR-ART.md](PRIOR-ART.md#architecture-that-outruns-implementation), where the
prior codebase shipped a payment service returning `'mock_client_secret'`.

**To add bKash PGW when merchant credentials exist:** implement `AutomaticRail`
with `createSession` (returns a redirect URL) and `confirm` (verifies the callback
signature or re-queries bKash, never trusts the browser), register it ahead of the
manual rail in `lib/payments/index.ts`, and return `false` from `isConfigured()`
when credentials are absent. Checkout renders whichever rails are configured, so
the manual rail degrades into a fallback with no conditional logic in the pages.
Stripe registers the same way.

Both rails still converge on `grantEnrollment` (invariant 7) — the automatic rail
calls it from `confirm`, the manual rail from admin approval.

### Payments

Two rails. `orders` stays payment-agnostic; the rail-specific detail lives here.

- `payments` — order_id, method (`STRIPE` | `BKASH`), status
  (`PENDING` | `PENDING_VERIFICATION` | `COMPLETED` | `FAILED` | `REFUNDED`), amount, currency
  - Stripe: `stripe_payment_intent_id`, `stripe_charge_id`
  - bKash: `transaction_id`, `phone_number`, `payment_date`, `bkash_reference`
  - Verification: `verified_by`, `verified_at`, `verification_notes`

Rail-specific requirements are enforced by conditional CHECK constraints rather than in the service
layer, following the pattern in [PRIOR-ART.md](PRIOR-ART.md#1-conditional-check-constraints-for-multi-method-payments-):

```sql
CHECK (method != 'BKASH' OR transaction_id IS NOT NULL)
CHECK (method != 'BKASH' OR phone_number ~ '^01\d{9}$')
CHECK (method != 'BKASH' OR currency = 'BDT')
CHECK (method != 'BKASH' OR status != 'COMPLETED' OR verified_by IS NOT NULL)
```

The last one is load-bearing: a manual payment cannot reach `COMPLETED` without recording the human
who verified it. Manual verification is where both fraud and honest error concentrate, and a rule
that lives only in a service method will not survive contact with a deadline.

Purchases are one-time and access is permanent, so there is no `subscriptions` table, no billing
period state, and no dunning or proration logic.

### Ops

- `audit_logs` — actor_id, action, target_type, target_id, metadata, ip
- `feature_flags`, `jobs` (or external queue), `analytics_events`

### Mentorship (P3 — schema reserved)

- `mentor_profiles`, `availability_slots`, `bookings`, `sessions`, `session_feedback`,
  `cohorts`, `cohort_members`

## Invariants

These are the decisions that are expensive to change later. Treat them as load-bearing.

1. **Entitlement lives on `enrollments`, never inferred from an order.** A learner holds at most
   one enrollment per course, and playback authorization checks only that row. This is what stops
   paid purchases, admin grants, refunds, and free courses from each special-casing the auth path.

   It also keeps the door open cheaply. Subscriptions are out of scope today, but if an all-access
   plan is ever added, it becomes: one new `source` value, plus a job that grants and revokes
   enrollments as the plan starts and lapses. The player, the progress model, and every
   authorization path stay untouched. Resist any shortcut that reads `orders` to decide access —
   that shortcut is what makes the later change expensive.
2. **`course_progress` is a derived rollup, never the source of truth.** Recomputed on
   `item_progress` write. It exists purely for dashboard read performance, and a background job
   should be able to rebuild it from scratch and get the same answer.
3. **`curriculum_items` is the single ordered spine.** Typed detail tables hang off it. This makes
   "reorder a section" one update instead of five, and keeps item ordering correct across mixed
   content types.
4. **Reviews require an active enrollment.** Enforce in the service layer *and* with a DB
   constraint.

5. **Payment confirmation comes from a Stripe webhook, never from the browser returning.**
   The success-redirect handler may *also* confirm, as a latency optimisation, but it cannot be the
   only path. A learner who pays and then closes the tab, loses connection, or gets a failed
   redirect must still end up enrolled.

   This is not hypothetical. The prior codebase at `GitHub/v3` confirms orders exclusively in a
   `verify-payment` function called by the browser after redirect, has no webhook handler, and
   consequently needed a `cancel_unpaid_order` routine to sweep up orders that were paid for but
   never confirmed. Enrollment grants hang off this, so getting it wrong means someone pays and
   receives nothing.

   Concretely: handle `checkout.session.completed`, verify the signature with
   `STRIPE_WEBHOOK_SECRET`, and make the handler idempotent — Stripe retries, and the redirect path
   may already have confirmed the same order.

6. **Money is computed server-side from stored values only.** Prices, discounts, tax, and any fees
   are read from the database inside the transaction. Never accept an amount, rate, or fee as a
   parameter from the client, even one that currently defaults to zero — a defaulted parameter is
   still a parameter, and RPC endpoints are callable directly regardless of what the UI sends.

7. **Entitlement is granted by exactly one code path, regardless of payment rail.** Stripe confirms
   via webhook; bKash confirms via admin approval. Both must converge on the *same* function that
   creates the `enrollments` row — not two parallel implementations that drift.

   This follows from invariant 1. If access were inferred from payment records, each rail would need
   its own branch in the auth check and the two would diverge. Because access reads `enrollments`,
   a rail only has to answer one question: has this been paid for, yes or no.

> **The numbering is load-bearing** — `lib/`, `app/`, and `prisma/schema.prisma` cite these by
> number in comments. Insert new invariants at the end rather than renumbering, or the citations
> silently start pointing at the wrong rule.

## Stack

Greenfield, so these are recommendations rather than constraints inherited from existing code.

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One codebase for SEO-critical catalog pages, app shell, and API routes. Server Components cut client JS on browse pages. |
| Database | PostgreSQL 16 | Relational integrity matters for entitlements, orders, progress. JSONB covers the flexible bits. |
| ORM | Prisma | Migrations and type-safety across a wide schema. Drop to raw SQL for analytics. |
| Auth | **Better Auth** | Open source (MIT), self-hosted, TypeScript-first, first-class Prisma adapter. User rows live in our Postgres. See note below. |
| Video | **AWS: S3 + MediaConvert + CloudFront** | Reuses infrastructure already provisioned, and keeps IVS available for P3 live classes. Supersedes the earlier Bunny decision — see note below. Accessed through the provider interface in `lib/video/provider.ts`. |
| Object storage | S3 or Cloudflare R2 | Resources, captions, certificates, original uploads. R2 for zero egress. |
| Search | Postgres FTS → Typesense/Meilisearch | FTS suffices at low catalog size. Migrate when facets and typo tolerance start hurting. |
| Cache/queue | Redis + BullMQ | Sessions, rate limits, and the async pipeline (transcode callbacks, email, ASR, progress rollups). |
| Payments | Stripe | One-time Checkout payments and Stripe Tax. Hosted fields keep us out of PCI scope. No Billing/subscription integration needed. |
| Email | Resend or Postmark | Transactional + React Email templates. |
| Uploads | Uppy + tus, or provider direct-upload | Resumable is non-negotiable for multi-GB lecture video. |
| Certificates | @react-pdf/renderer or headless Chromium | Generate async, store in object storage, serve signed. |
| Analytics | PostHog | Product events, funnels, flags, session replay in one place. |
| Testing | Vitest + Playwright | Unit/integration, plus E2E on the enrollment → player → completion path. |
| Hosting | Vercel + managed Postgres/Redis | Fastest path. Revisit if video-adjacent compute grows. |

### Why Better Auth, not Auth.js

Auth.js (NextAuth) was the obvious default until recently. It is no longer: the lead maintainer
stepped back in January 2025, and in September 2025 the project was folded into Better Auth and
moved to security-patch-only maintenance. Starting a new build on it means starting on an
unmaintained dependency.

Better Auth reached v1.0 in late 2024 and v1.6 in May 2026. It is MIT-licensed, framework-agnostic,
and has a first-class Prisma adapter, so auth tables live in our Postgres alongside application
tables — we own the user records as rows in a schema we can query and join against.

**Known gap:** native SAML/SCIM enterprise SSO is in development but not shipped. That is our P2
SSO line item. For a public-facing paid academy where learners self-register, this is low risk; if
enterprise/B2B ever becomes a priority, revisit before committing further.

### Video: AWS, superseding Bunny

The original Bunny recommendation was made before reviewing `GitHub/globalmentor360`.
Three facts from that review change the answer.

**The infrastructure already exists and is paid for.** S3 bucket, CloudFront distribution
with a signing key pair, MediaConvert endpoint and role, MediaPackage channels, and an
IVS stage are all provisioned.

**Bunny cannot do live streaming at any price.** Live classes are P3, but they are a
confirmed requirement. Choosing Bunny means running two video vendors the moment they
land; choosing AWS means IVS is already there.

**The cost gap narrows once both are honest.** Bunny won partly on "native DRM," which
turned out to be a $99/mo add-on incompatible with our own player
([below](#what-content-protection-actually-costs)). Against signed-URL-only delivery —
what we actually ship — the comparison is CloudFront vs Bunny CDN, not Bunny vs a DRM
tier nobody is buying.

**What must be built, because the prior repo did not build it despite appearances:**

| Component | State in `globalmentor360` |
|---|---|
| MediaConvert transcoding | Real, ~310 lines |
| IVS / IVS Real-time | Real, ~326 lines |
| S3 upload + presigned URLs | Real |
| **CloudFront signed URLs** | **Not implemented.** Key pair exists in env; no signer dependency, no signing code |
| **DRM** | **Not implemented.** `protectVideo()` returns the literal string `` `drm-protected-url-${id}` ``; SPEKE was skipped as "complex" |
| **Watermarking** | **Not implemented.** Placeholder comment |

So CloudFront signing is genuinely new work, not a port. It is also the single thing
standing between paid content and anyone with the URL, so it is P0 for the player.

**Blocked on credential rotation.** The AWS keys are committed to a pushed branch in the
old repo (see [PRIOR-ART.md](PRIOR-ART.md#credential-hygiene)). Rotate before wiring
anything to them.

### Why Bunny Stream (superseded — kept for the cost analysis)

Video is the product on a paid platform, which makes two things matter more than they would
elsewhere: unit cost, because delivery scales directly with revenue-generating usage, and content
protection, because the entire value proposition is behind the paywall.

Bunny Stream is roughly half the cost of Cloudflare Stream and well under Mux, at approximately
$0.005/GB stored and $0.01/GB delivered, with no per-video fees.

### What content protection actually costs

An earlier draft of this document claimed Bunny ships Widevine/FairPlay DRM natively. That was
wrong, and the correction changes what we can plan for.

Bunny has two tiers, and only one of them is real DRM:

| | MediaCage **Basic** | MediaCage **Enterprise** |
|---|---|---|
| Technology | Dynamic *clear key* encryption, session-based keys | Widevine + FairPlay, hardware-backed keys |
| Cost | Included | $99/mo + $0.005–0.003 per license, tiered |
| Player | **Bunny's embed only** — third-party players disabled | Works with our own player |
| Caveats | No MP4 fallback, no Early-Play | Sales contact above 500k licenses/mo |

Two things follow.

**Clear key is not DRM in any meaningful sense.** The decryption key is delivered unprotected, so
it raises effort above a bare URL and stops nothing else. Do not describe it to stakeholders as
content protection.

**MediaCage Basic is incompatible with our player.** It mandates playback through Bunny's
proprietary embed and disables third-party players. Section C of the catalog — timestamped notes,
interactive transcripts, keyboard shortcuts, playback telemetry feeding section K — all require a
player we control. Enabling Basic DRM would break those features, so we will not use it.

**What we actually ship at P0: signed, expiring playback URLs.** These are included, work with our
own player. Since AWS superseded Bunny (above), these ship as CloudFront signed URLs in
`lib/video/aws.ts`; `lib/video/bunny.ts` remains only as the reference implementation of the
previous vendor. They gate access to the manifest; they do
not encrypt the file. That is the honest security posture — a determined, technically capable
learner can retain content they have legitimately paid to access. Every course platform below the
Enterprise-DRM tier has this property, including ones that market otherwise.

**When to revisit.** If measured piracy justifies $99/mo plus per-license fees, Enterprise DRM
becomes the answer — and note licenses bill per device *and per key*, so one playback typically
issues two (video and audio track). Budget roughly double the headline rate. This is not a
Bunny-specific tax: Mux and most competitors also gate real multi-DRM behind a paid tier, so the
cost comparison that selected Bunny is unaffected by this correction.

**The tradeoff:** Mux has materially better per-view analytics, and section K of the catalog wants
drop-off curves and rewatch heatmaps. We take that on ourselves — the player already emits playback
telemetry at P0 (section C), so engagement analytics are built from our own event stream rather
than bought. That is real work we are choosing to do in exchange for an order-of-magnitude lower
recurring bill.

**Mitigation:** all video operations go through a provider interface (`lib/video/provider.ts`), so
upload, playback-URL signing, and webhook handling are swappable. If the analytics burden proves
worse than expected, moving to Mux is contained to one module rather than spread through the
studio and the player.

### Toolchain pins — do not casually upgrade

Two dependencies are held below `latest` on purpose. Both were found by actually running the
tooling, not predicted.

**TypeScript pinned to 6.x.** `typescript@latest` resolves to 7.0, the Go-based rewrite. `tsc` and
`next build` both work fine on it, but `typescript-eslint` does not support TS 7 yet
([tracking issue](https://github.com/typescript-eslint/typescript-eslint/issues/10940)), which
breaks linting entirely. Losing lint on day one costs more than the compiler speed gains. Revisit
when typescript-eslint ships TS 7 support.

**ESLint pinned to 9.x.** `eslint@latest` resolves to 10.x, which changed the rule context API.
The `eslint-plugin-react` bundled inside `eslint-config-next@16.3` still calls the old API and
throws `contextOrFilename.getFilename is not a function` on any JSX file. Revisit when
eslint-config-next supports ESLint 10.

### Prisma 7 notes

Prisma 7 changed two things that affect every developer on this repo:

- **`url` is gone from the `datasource` block.** The migrate/introspect connection string now lives
  in `prisma.config.ts`. Putting it back in the schema is a hard validation error.
- **The runtime client needs a driver adapter.** `lib/db.ts` constructs `PrismaClient` with
  `PrismaPg`. There is no implicit connection from the schema any more.

The generator is also `prisma-client` (not the old `prisma-client-js`) with a required `output`,
so the client lands in `generated/` and is gitignored — regenerate with `npm run db:generate`
after pulling schema changes.

## Build Phases

**P0 — MVP.** A learner can find, buy, watch, and complete a course.
Auth and roles → taxonomy and course model → authoring studio with curriculum builder → video
upload/transcode pipeline → course landing page → search → cart/checkout/entitlement → player with
progress → quizzes → Q&A and reviews → certificates → instructor Q&A dashboard and basic
performance stats.

**P1 — Fast follow.**
Captions and transcripts, notes and bookmarks, practice tests, assignments, coupons and refunds,
notification center, wishlist, engagement analytics, moderation queue, i18n framework, GDPR flows.

**P2 — Mature.**
Learning paths, recommendations, coding exercises, AI assistant and semantic search, streaks and
goals, SSO, advanced analytics, gifting, bulk purchase, PWA.

**P3 — Mentorship and advanced.**
The full mentorship layer, native apps with offline download, labs/workspaces, AI role-play and
skills mapping.

**Sizing note.** P0 is the bulk of the work. The video pipeline and the authoring studio are each
larger than they appear, and the entitlement/progress model is where correctness bugs will
concentrate.

## Verification

Verification is defined per phase rather than as a one-time check. The list below is the target;
see the README status table for what is actually green today. Unticked items are gaps, not history.

### Critical E2E path

Playwright. Must pass before P0 sign-off.

1. Register → verify email → sign in
2. Author signs in, creates a course, uploads a video, waits for `ready`, adds a quiz, publishes
3. Learner searches, finds the course, plays the free preview lecture while logged out
4. Learner purchases via Stripe test mode → `enrollment` row exists → receipt emailed
5. Learner watches a lecture → `item_progress.last_position_seconds` advances → refresh resumes
   at position
6. Learner passes the quiz, completes all items → `course_progress.percent = 100`
7. Certificate generates, downloads, and verifies at the public verification URL
8. Learner posts a review and a Q&A question; instructor sees both in their dashboard

### Targeted checks

- **Entitlement** — signed-out and non-enrolled users both get 403 on a non-preview playback URL;
  signed playback URLs expire. A paid course is unplayable until an `enrollments` row exists.
- **Free course** — a course priced 0 enrolls without touching checkout, and still produces a
  normal `enrollments` row rather than a special case.
- **Refund** — refunding an order revokes the enrollment and blocks playback.
- **Payment without redirect** — complete a Stripe test payment, then discard the browser session
  before the success redirect fires. The webhook must still create the enrollment. This is the
  check that would have caught the gap in the prior codebase.
- **Webhook idempotency** — replay the same `checkout.session.completed` event twice; the second
  delivery must not double-enroll or double-count a coupon redemption.
- **bKash happy path** — submit a transaction, confirm the payment sits in `PENDING_VERIFICATION`
  with no enrollment, approve it as an admin, confirm the enrollment appears and `verified_by` is
  populated.
- **bKash cannot self-approve** — attempt to set a bKash payment to `COMPLETED` without
  `verified_by`; the database constraint must reject it. Test at the DB level, not through the
  service, since the point is that the service can't bypass it.
- **Both rails converge** — a Stripe purchase and an approved bKash payment for the same course
  produce structurally identical `enrollments` rows (differing only in `source`).
- **Progress rollup** — recompute `course_progress` from `item_progress` in a job and assert it
  matches the live value. Catches rollup drift.
- **Transcode failure** — force a bad upload, confirm status surfaces in the studio and retry works.
- **Accessibility** — axe-core in CI on catalog, landing, and player pages; manual keyboard-only
  pass through the player.
- **Load** — k6 against the player's progress-write endpoint, the highest-write path in the system.

### Phase gate

Every phase ships with its slice of the E2E suite green, plus a manual pass through the newly added
features in the running app.
