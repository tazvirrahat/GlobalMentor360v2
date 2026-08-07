# GlobalMentor360

An online learning platform with a Udemy-style feature surface, scoped as a
**single-organization academy** — we own all content. No third-party instructors, no revenue
share, no marketplace mechanics.

Mentorship features (1:1 booking, live sessions, cohorts) are planned for a later phase and are
specced up front so the data model accommodates them.

## Status

Early scaffold. Authentication works end to end; nothing else does.

**Works:** registration, sign-in, sign-out, session-gated routes, role assignment, the course
catalog and landing page with entitlement-aware preview/locked marking, and the payment CHECK
constraints (verified against the database, not just declared).

**Doesn't exist yet:** search, the course player, progress tracking, checkout, certificates, the
authoring studio. The video provider interface is written but has never run against a real Bunny
account.

## Getting started

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:generate && npm run db:push && npm run db:seed
npm run dev
```

The default `DATABASE_URL` in `.env.example` already matches the compose file, so nothing needs
editing for local work. `db:generate` works without a database; `db:push` and `db:seed` do not.

The seed creates two accounts, both with password `dev-password-12345`:

| Email | Roles |
|---|---|
| `instructor@example.com` | learner, instructor |
| `admin@example.com` | learner, admin |

| Command | Does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (unit) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:db` | Payment constraint tests (needs the Postgres container running) |
| `npm run db:generate` | Regenerate the Prisma client (run after schema changes) |
| `npm run db:push` | Push schema to the database without a migration |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | Seed taxonomy, staff accounts, and a sample course |
| `npm run db:studio` | Browse the database |

## Documentation

| Document | Contents |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | Complete feature catalog — 16 categories, each feature phase-tagged P0–P3 |
| [docs/TECH-SPEC.md](docs/TECH-SPEC.md) | Data model, invariants, stack, build phases, verification strategy |

## Phases at a glance

- **P0 — MVP.** A learner can find, buy, watch, and complete a course.
- **P1 — Fast follow.** Captions, notes, practice tests, assignments, coupons, analytics.
- **P2 — Mature.** Learning paths, recommendations, coding exercises, AI assistant, gifting.
- **P3 — Mentorship.** 1:1 booking, live sessions, cohorts, native apps, offline.

## Commercial model

Paid platform, **per-course purchase** — buy a course, keep access indefinitely. Free preview
lectures are supported, and a course may be published at price 0 as lead generation.

Subscriptions are out of scope. Access is permanent, so there is no recurring billing, dunning, or
proration to build. Full scope decisions are in
[docs/FEATURES.md](docs/FEATURES.md#confirmed-scope).
