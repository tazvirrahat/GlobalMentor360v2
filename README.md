# GlobalMentor360

An online learning platform with a Udemy-style feature surface, scoped as a
**single-organization academy** — we own all content. No third-party instructors, no revenue
share, no marketplace mechanics.

Mentorship features (1:1 booking, live sessions, cohorts) are planned for a later phase and are
specced up front so the data model accommodates them.

## Status

Scaffold stage. The project builds and the full database schema is written, but no features are
implemented — there are no courses, no player, no checkout.

What exists: Next.js 16 + React 19 + TypeScript, the complete Prisma 7 schema from the spec, and
Better Auth wired to Postgres. What doesn't: everything in `docs/FEATURES.md`.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL
npm run db:generate
npm run dev
```

You need a Postgres 16+ instance before `db:push` or `db:migrate` will do anything. `db:generate`
works without one.

| Command | Does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate the Prisma client (run after schema changes) |
| `npm run db:push` | Push schema to the database without a migration |
| `npm run db:migrate` | Create and apply a migration |

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
