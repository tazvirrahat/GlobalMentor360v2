# GlobalMentor360

An online learning platform with a Udemy-style feature surface, scoped as a
**single-organization academy** — we own all content. No third-party instructors, no revenue
share, no marketplace mechanics.

Mentorship features (1:1 booking, live sessions, cohorts) are planned for a later phase and are
specced up front so the data model accommodates them.

## Status

Specification stage. No application code yet.

## Documentation

| Document | Contents |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | Complete feature catalog — 16 categories, each feature phase-tagged P0–P3 |
| [docs/TECH-SPEC.md](docs/TECH-SPEC.md) | Data model, invariants, stack, build phases, verification strategy |

## Phases at a glance

- **P0 — MVP.** A learner can find, buy, watch, and complete a course.
- **P1 — Fast follow.** Captions, notes, practice tests, assignments, coupons, analytics.
- **P2 — Mature.** Subscriptions, learning paths, recommendations, coding exercises, AI assistant.
- **P3 — Mentorship.** 1:1 booking, live sessions, cohorts, native apps, offline.

## Open scoping questions

The catalog assumes we charge for courses and that the platform is public-facing rather than
internal L&D. Both assumptions are called out in
[docs/FEATURES.md](docs/FEATURES.md#scoping-assumptions) and materially change scope if wrong.
