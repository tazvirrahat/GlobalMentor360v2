# GlobalMentor360

A **single-organization online academy** — we own all content. No third-party
instructors, no revenue share, no marketplace mechanics. Mentorship features
(1:1 booking, live sessions, cohorts) are planned for a later phase.

## Status

The buy → watch → complete spine works end to end. Human-facing status (what
you can click today, what still needs a domain/email/Stripe) is
[docs/PRODUCT-STATUS.md](docs/PRODUCT-STATUS.md). Several P0 features from
[docs/FEATURES.md](docs/FEATURES.md) are not built yet — that catalog is the
wishlist, not the running app.

| Area | Status |
|---|---|
| Auth (Better Auth: email/password, required email verification, password reset, roles) | Working |
| Catalog + search | Working — Postgres full-text (+ trigram/ILIKE fallback), filters (level, category, price, rating, language) and sort |
| Course landing with Buy / Enrol free | Working — links free-preview lectures |
| bKash manual checkout + admin verification | Working — learner submits a trx ID; `/admin/payments` is Approve/Reject of **that** proof, not a student/course picker. Set `BKASH_MERCHANT_NUMBER` so checkout can show where to send money |
| Stripe Checkout (automatic rail) | Working when credentials are set |
| Authoring studio: course, curriculum, video upload | Working |
| Authoring studio: quiz builder, article body, per-answer explanations | Working |
| Authoring studio: landing-page editor | Partial — objectives, requirements, audience editable in settings; thumbnail upload **not built** |
| AWS video upload / MediaConvert / CloudFront | Provider wired; needs rotated AWS keys |
| Course player + quiz-gated unlock | Working |
| Progress + certificates | Working — public verify page + on-the-fly PDF at `/certificates/[serial]/pdf` (`pdfKey` unused) |
| My Learning dashboard | Working |
| Course reviews + rating aggregation + histogram | Working — recency weighting deferred |
| Course Q&A (threaded, per lecture and per course) | Working |
| Instructor Q&A inbox | Working |
| Course announcements + email | Working — capped at 500 recipients until a queue exists |
| Order history + receipts | Working |
| Cart, multi-item checkout | Working — `/cart` mixes free + paid; paid checks out via bKash (or a 100% coupon) |
| Admin | Working — payments queue, refunds, users (roles), courses (publish), reviews (hide/restore); no taxonomy editor |
| Coupons | Working — studio (course-scoped) + admin (site-wide), applied at bKash checkout |
| Product event pipeline | Working — events recorded; no dashboard yet |
| Engagement + revenue dashboards | **Not built** |

Prices display bKash-first: when a course has a BDT price, that is the price the
catalog, landing and course pages show (Stripe hides itself without keys, so the
USD price led learners to a checkout that couldn't take it).

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript — APIs in `app/api/`; there is no Express server
- **Postgres 16** via Prisma 7
- **Better Auth** (open source, self-hosted — no Supabase)
- **Tailwind CSS v4** + shadcn/ui
- **Payments:** Stripe (automatic) + bKash manual admin-verify
- **Video:** AWS S3 → MediaConvert → CloudFront signed URLs

## Getting started

```bash
npm install
cp .env.example .env
# fill BETTER_AUTH_SECRET (npx @better-auth/cli secret)
docker compose up -d
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev
```

Use `npm run db:migrate`, not `npm run db:push`. `db:push` makes the database
match `schema.prisma` and **drops** `courses.search_vector` (a generated
tsvector plus GIN indexes that exist only in SQL migrations). Catalog
full-text search breaks until you re-apply that migration.

Seed accounts — identify them by **email** (re-seed does not rename an existing
`User.name`; do not rename those rows). Password for all three:
`dev-password-12345`.

| Email | Roles |
|---|---|
| `learner@example.com` | learner (enrolled in the sample course) |
| `instructor@example.com` | learner, instructor |
| `admin@example.com` | learner, admin |

| Command | Does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit suite — needs no database |
| `npm run test:db` | Every database-backed suite (needs Postgres) |
| `npm run test:db:flows` | Integration tests: payment rails, authoring, Q&A, reviews, orders |
| `npm run test:e2e` | Playwright critical path (needs `npm run dev`) |
| `npm run db:migrate` | Apply migrations (`db:push` drops `search_vector` — don't) |
| `npm run db:seed` | Taxonomy, staff/learner accounts, sample course |
| `npm run db:studio` | Browse the database |

### Stripe (local)

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Put the webhook signing secret into `STRIPE_WEBHOOK_SECRET` and a test secret key
into `STRIPE_SECRET_KEY`. Without them the card rail hides itself at checkout.

### Email (AWS SES)

The AWS account is in the **SES sandbox** (production sending access was
denied): only verified identities/recipients can receive mail. Leave
`EMAIL_FROM` empty locally and read verification links from the **dev server
console**. Production refuses that fallback, so real sign-ups need working
mail.

### AWS video

Reuse the existing `globalmentor360-mumbai` bucket / MediaConvert role /
CloudFront distribution in `ap-south-1` (identifiers are in `.env.example`).
**Rotate the access keys and CloudFront key pair first** — the previous
prototype committed them to git history. P0 content protection is CloudFront
signed URLs; DRM is deferred.

Studio “Check status” and opening the curriculum list drain MediaConvert
COMPLETE/ERROR from SQS. `POST /api/video/webhook` is implemented but **waits
for a public HTTPS domain** — AWS cannot reach localhost. Do not create an
EventBridge Connection until that origin exists (it stores the secret in
Secrets Manager even if unused).

## Documentation

| Document | Contents |
|---|---|
| [docs/PRODUCT-STATUS.md](docs/PRODUCT-STATUS.md) | What is actually in the running app |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature catalog, phases P0–P3 |
| [docs/TECH-SPEC.md](docs/TECH-SPEC.md) | Data model, invariants, stack, verification |
| [docs/PRIOR-ART.md](docs/PRIOR-ART.md) | Lessons from the old prototype |

## Commercial model

Per-course purchase — buy once, keep forever. Free preview lectures and
price-0 courses are supported. Subscriptions are out of scope.
