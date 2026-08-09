# GlobalMentor360

A **single-organization online academy** — we own all content. No third-party
instructors, no revenue share, no marketplace mechanics. Mentorship features
(1:1 booking, live sessions, cohorts) are planned for a later phase.

## Status

The buy → watch → complete spine works end to end. Several P0 features from
[docs/FEATURES.md](docs/FEATURES.md) are not built yet — the table says which.

| Area | Status |
|---|---|
| Auth (Better Auth: email/password, required email verification, password reset, roles) | Working |
| Catalog + search | Working — substring match; filters limited to level and category |
| Course landing with Buy / Enrol free | Working |
| bKash manual checkout + admin verification | Working |
| Stripe Checkout (automatic rail) | Working when credentials are set |
| Authoring studio: course, curriculum, video upload | Working |
| Authoring studio: quiz builder, article body, landing-page editor | **Not built** — quizzes exist only via seed |
| AWS video upload / MediaConvert / CloudFront | Provider wired; needs rotated AWS keys |
| Course player + quiz-gated unlock | Working |
| Progress + certificates | Working — certificate PDF not generated (`pdfKey` unused) |
| My Learning dashboard | Working |
| Reviews, Q&A, announcements | **Not built** — schema only, all P0 |
| Cart, order history, receipts | **Not built** — schema only |
| Admin beyond the payment queue | **Not built** — no user, course, or taxonomy admin |
| Analytics + event pipeline | **Not built** — `AnalyticsEvent` unused |

Free preview lectures are playable signed-out at `/learn/[slug]/[itemId]`, but the
course landing page does not link to them yet.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
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

Seed accounts (password `dev-password-12345`):

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
| `npm run test` | Vitest (unit) |
| `npm run test:db` | Payment CHECK constraint tests (needs Postgres) |
| `npm run test:e2e` | Playwright critical path (needs `npm run dev`) |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Taxonomy, staff/learner accounts, sample course |
| `npm run db:studio` | Browse the database |

### Stripe (local)

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Put the webhook signing secret into `STRIPE_WEBHOOK_SECRET` and a test secret key
into `STRIPE_SECRET_KEY`. Without them the card rail hides itself at checkout.

### AWS video

Reuse the existing `globalmentor360-mumbai` bucket / MediaConvert role /
CloudFront distribution in `ap-south-1` (identifiers are in `.env.example`).
**Rotate the access keys and CloudFront key pair first** — the previous
prototype committed them to git history. P0 content protection is CloudFront
signed URLs; DRM is deferred.

## Documentation

| Document | Contents |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | Feature catalog, phases P0–P3 |
| [docs/TECH-SPEC.md](docs/TECH-SPEC.md) | Data model, invariants, stack, verification |
| [docs/PRIOR-ART.md](docs/PRIOR-ART.md) | Lessons from the old prototype |

## Commercial model

Per-course purchase — buy once, keep forever. Free preview lectures and
price-0 courses are supported. Subscriptions are out of scope.
