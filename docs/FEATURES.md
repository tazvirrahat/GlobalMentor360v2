# GlobalMentor360 — Feature Catalog

A complete inventory of the platform's feature surface, modelled on Udemy and scoped to a
**single-organization academy**: we own all content. There are no third-party instructors, no
revenue share, no instructor payouts, and no marketplace ranking mechanics. Throughout this
document "instructor" means *a staff author inside our org*, not a public seller.

This is a **what-it-does** document. No UI, layout, or visual design decisions are made here —
see [TECH-SPEC.md](TECH-SPEC.md) for the data model, stack, and build phases.

## Phase legend

| Tag | Meaning |
|---|---|
| **P0** | MVP — a learner can find, buy, watch, and complete a course |
| **P1** | Fast follow |
| **P2** | Mature product |
| **P3** | Mentorship layer and advanced |

## Scoping assumptions

These shape the catalog. Flag any that are wrong.

1. **We charge for courses.** A single-org academy still needs commerce, so pricing, cart,
   checkout, coupons, subscriptions, and refunds are included. If the academy is free or
   internal-only, delete [section I](#i-commerce--monetization) and roughly 15% of the build
   goes with it.
2. **Public-facing, not internal L&D.** Learners self-register. If this is employee training,
   section A shifts to SSO-first and section I is replaced by seat licensing.
3. **Web first, mobile later.** Native apps are catalogued but phased last.

---

## A. Identity, accounts & profiles

| Feature | Phase |
|---|---|
| Email/password registration with verification | P0 |
| Social login (Google, Apple, Facebook, GitHub) | P1 |
| Password reset, change password, session revocation | P0 |
| Role system: learner, instructor/author, admin, support, moderator | P0 |
| Public learner profile (name, headline, bio, avatar, links) | P1 |
| Instructor profile page (bio, credentials, course list, aggregate rating) | P0 |
| Account settings: email, language, timezone, notification prefs | P0 |
| Privacy controls (profile visibility, show/hide courses taken) | P1 |
| Account deletion + data export (GDPR erasure/portability) | P1 |
| 2FA / TOTP | P2 |
| SSO — SAML/OIDC | P2 |
| Multi-device session list with remote sign-out | P2 |

## B. Catalog, discovery & search

| Feature | Phase |
|---|---|
| Category → subcategory → topic taxonomy | P0 |
| Full-text course search (title, subtitle, description, instructor, topic) | P0 |
| Search filters: rating, duration bucket, level, language, price, captions, features | P0 |
| Search sort: relevance, most popular, highest rated, newest | P0 |
| Typeahead / autocomplete suggestions | P1 |
| Search relevance tuning + synonym dictionary | P1 |
| Course landing page: objectives, requirements, description, curriculum preview, instructor bio, reviews, FAQ | P0 |
| Free preview lectures (marked previewable, playable while logged out) | P0 |
| Curriculum outline with per-lecture duration and total course length | P0 |
| "Students also bought / also viewed" recommendations | P2 |
| Personalized homepage recommendations from history and interests | P2 |
| Topic/category landing pages with curated shelves | P1 |
| Wishlist / save for later | P1 |
| Recently viewed courses | P1 |
| Browse by skill and skill-level tags | P1 |
| Course comparison across overlapping topics | P2 |
| SEO: sitemap, structured data, canonical URLs, OG tags per course | P1 |

## C. Course consumption — the player

| Feature | Phase |
|---|---|
| Adaptive-bitrate streaming (HLS/DASH) with quality selector | P0 |
| Playback speed control (0.5×–2×), persisted across lectures | P0 |
| Resume from last watched position, synced across devices | P0 |
| Auto-advance to next lecture, with toggle | P0 |
| Keyboard shortcuts (play/pause, seek, speed, fullscreen, captions) | P1 |
| Closed captions / subtitles, multi-language, on/off toggle | P0 |
| Auto-generated captions from ASR, editable by author | P1 |
| Interactive transcript — skim text, click to jump to timestamp | P1 |
| Transcript search within a lecture | P2 |
| Course-wide content search (lectures, transcripts, resources) | P2 |
| Timestamped notes, created in-player, exportable | P1 |
| Bookmarks on lectures | P1 |
| Downloadable resources attached to lectures | P0 |
| Picture-in-picture, theater and fullscreen modes | P1 |
| Volume/mute persistence, audio-only mode | P2 |
| Video watermarking / signed playback URLs (anti-piracy) | P1 |
| Playback analytics events (watch %, drop-off, rewatch) | P0 |
| Non-video lecture types: article/text, audio, embedded slides, PDF | P0 |
| External resource links per lecture | P0 |

## D. Curriculum item types & assessment

| Feature | Phase |
|---|---|
| Sections → lectures hierarchy with reordering | P0 |
| Quizzes: multiple choice, multi-select, true/false | P0 |
| Quiz explanations per answer + knowledge-area tagging | P0 |
| Quiz retakes, scoring, per-question review | P0 |
| Practice tests: timed, exam-simulating, full-length | P1 |
| Practice test results: breakdown by knowledge area, pass/fail threshold, review mode | P1 |
| Coding exercises: in-browser editor, run tests, pass/fail, hints, solution reveal | P2 |
| Exercise languages (Python, JS, Java, C++, SQL to start) | P2 |
| Assignments: prompt, duration estimate, downloadable brief, learner submission | P1 |
| Assignment solution reveal + peer/instructor review | P1 |
| Hands-on labs / sandboxed workspaces | P3 |
| Item-level completion rules (must-watch %, must-pass quiz) | P1 |
| Section/course prerequisites and drip scheduling | P2 |

## E. Progress, completion & credentials

| Feature | Phase |
|---|---|
| Per-lecture completion checkbox and auto-complete on watch | P0 |
| Course progress % and remaining-time estimate | P0 |
| "My Learning" dashboard: in-progress, completed, wishlist, archived | P0 |
| Archive/unarchive enrolled courses | P1 |
| Certificate of completion — generated PDF with unique ID | P0 |
| Public certificate verification page by ID | P1 |
| Certificate sharing (LinkedIn, download, direct link) | P1 |
| Learning streaks and weekly goal setting | P2 |
| Learning reminders (email/push, scheduled) | P2 |
| Skill/badge accumulation across courses | P2 |
| Learning paths — ordered multi-course programs with own completion state | P2 |

## F. Engagement & community

| Feature | Phase |
|---|---|
| Course Q&A: threaded questions per lecture and per course | P0 |
| Q&A upvoting, sorting (recent, most upvoted, unanswered) | P1 |
| Q&A search within course | P1 |
| "Answered by instructor" badge + follow thread | P1 |
| Course announcements to enrolled learners | P0 |
| Direct messaging learner ↔ instructor | P2 |
| Course reviews: star rating + written review | P0 |
| Review editing, helpfulness voting, reporting | P1 |
| Instructor response to reviews | P1 |
| Rating aggregation, distribution histogram, recency weighting | P0 |
| Review moderation queue | P1 |
| Content reporting / abuse flags on any user content | P1 |

## G. Authoring studio

| Feature | Phase |
|---|---|
| Course create wizard: title, category, level, language, goals | P0 |
| Curriculum builder: add/reorder/nest sections and items, drag-drop | P0 |
| Bulk video upload with progress, resumable | P0 |
| Per-lecture editor: title, description, resources, captions, preview flag | P0 |
| Landing page editor: subtitle, description, objectives, requirements, target audience, thumbnail, promo video | P0 |
| Draft → in-review → published → unpublished lifecycle | P0 |
| Course versioning and change history | P2 |
| Quiz builder | P0 |
| Practice test and assignment builders | P1 |
| Captions upload (VTT/SRT) + caption editor | P1 |
| Course pricing and coupon controls | P1 |
| Bulk operations (publish, price change, tag) | P2 |
| Course quality checklist / readiness score before publish | P1 |
| Course cloning and templating | P2 |
| Multi-author collaboration with per-course permissions | P2 |
| Instructor Q&A dashboard: filter by unanswered/course/date, bulk reply | P0 |
| Assignment review queue with feedback | P1 |
| Announcement composer with audience targeting | P0 |

## H. Content pipeline & media infrastructure

| Feature | Phase |
|---|---|
| Resumable/chunked upload to object storage | P0 |
| Async transcode to multi-bitrate HLS + thumbnails | P0 |
| Transcode status surfaced in studio, retry on failure | P0 |
| Automatic speech recognition → caption generation | P1 |
| Machine translation of captions | P2 |
| Signed, expiring playback URLs; DRM optional | P1 |
| Audio normalization and quality checks (resolution, audio level) | P1 |
| CDN delivery, geo-distributed | P0 |
| Storage lifecycle (archive originals to cold storage) | P2 |

## I. Commerce & monetization

| Feature | Phase |
|---|---|
| Per-course pricing with multi-currency support | P0 |
| Shopping cart, multi-item checkout | P0 |
| Payment processing (cards, wallets, regional methods) | P0 |
| Coupon codes: percentage/fixed, expiry, usage caps, course-scoped | P1 |
| Sitewide promotions and sale pricing | P1 |
| Subscription plan — all-access monthly/annual | P2 |
| Free courses and free enrollment path | P0 |
| Order history, invoices/receipts | P0 |
| 30-day refund policy with self-serve refund request | P1 |
| Tax calculation (VAT/GST) and tax-inclusive display | P1 |
| Gift a course / redeem gift code | P2 |
| Bulk/team purchase with seat assignment | P2 |
| Enrollment entitlements decoupled from purchase (grant/revoke) | P0 |

## J. Notifications & messaging

| Feature | Phase |
|---|---|
| Transactional email (welcome, verify, receipt, password reset) | P0 |
| Course announcement email to enrolled learners | P0 |
| Q&A reply notifications | P1 |
| In-app notification center with read/unread | P1 |
| Per-category notification preferences and unsubscribe | P1 |
| Push notifications (web + mobile) | P2 |
| Digest emails (weekly progress, recommendations) | P2 |

## K. Analytics & reporting

| Feature | Phase |
|---|---|
| Course performance: enrollments, completion rate, ratings over time | P0 |
| Engagement analytics: per-lecture drop-off, average watch %, rewatch heatmap | P1 |
| Traffic & conversion: landing page views → enrollment funnel | P1 |
| Revenue reporting: by course, by period, by coupon | P1 |
| Assessment analytics: per-question difficulty, common wrong answers | P2 |
| Learner-level progress reports, CSV export | P1 |
| Platform admin dashboard: DAU/MAU, enrollments, revenue, top content | P1 |
| Event pipeline for product analytics | P0 |

## L. Admin, moderation & platform operations

| Feature | Phase |
|---|---|
| User admin: search, view, suspend, impersonate (audited), assign roles | P0 |
| Course admin: force unpublish, feature/pin, edit taxonomy | P0 |
| Content moderation queue (reviews, Q&A, reports) | P1 |
| Taxonomy management (categories, topics, skills) | P0 |
| Coupon/promotion administration | P1 |
| Audit log of privileged actions | P1 |
| Feature flags | P1 |
| Support tooling: issue refund, grant enrollment, reissue certificate | P1 |
| Background job monitoring (transcode, email, ASR) | P0 |
| Rate limiting and abuse prevention | P1 |

## M. AI features

| Feature | Phase |
|---|---|
| AI course assistant grounded in course transcripts | P2 |
| AI-generated lecture summaries and key takeaways | P2 |
| AI-generated quiz questions from lecture content (author reviews before publish) | P2 |
| Semantic search over course content (embeddings) | P2 |
| AI-assisted course outline drafting in the studio | P2 |
| AI-assisted coding exercise generation (solution + test cases) | P3 |
| AI role-play / conversation practice with feedback | P3 |
| AI skills mapping — goal → generated learning path | P3 |

## N. Mobile & offline

| Feature | Phase |
|---|---|
| Responsive web player (mobile browser) | P0 |
| Cross-device sync of progress, notes, bookmarks | P1 |
| PWA with installability | P2 |
| Native iOS/Android apps | P3 |
| Offline lecture download with encrypted local storage | P3 |
| Background audio playback, Chromecast/AirPlay | P3 |

## O. Accessibility, i18n & compliance

| Feature | Phase |
|---|---|
| WCAG 2.1 AA: keyboard nav, screen reader, focus management, contrast | P0 |
| Captions and transcripts as accessibility baseline | P0 |
| PCI compliance via hosted payment fields (never touch card data) | P0 |
| UI localization (i18n framework, string extraction) | P1 |
| Multi-language course metadata | P1 |
| GDPR/CCPA: consent, cookie banner, data export, erasure | P1 |
| Terms/privacy versioning with acceptance tracking | P1 |
| RTL layout support | P2 |

## P. Mentorship layer — deferred (P3)

Not built in early phases, but specced now so the schema accommodates it without a rewrite.

| Feature |
|---|
| Mentor profiles: expertise tags, rate, languages, availability |
| Mentor discovery and matching (by skill, goal, availability) |
| Availability calendar with timezone handling |
| 1:1 session booking, reschedule, cancel with policy windows |
| Live video sessions (WebRTC or third-party SDK) with recording |
| Session notes, action items, shared resources |
| Cohort-based courses with fixed start dates and shared progress |
| Group office hours / live workshops with registration |
| Mentor ratings and session feedback |
| Mentorship packages (multi-session bundles) and subscriptions |
| Mentor earnings and payout |

> **Note:** the last row reintroduces the revenue-share machinery deliberately excluded from the
> single-org scope. If mentors are ever external contractors rather than staff, that is a
> significant scope change, not a small addition.

---

## Sources

Feature surface verified against current Udemy documentation (August 2026):

- [Curriculum items & course creation](https://support.udemy.com/hc/en-us/sections/206458468-Creating-Content)
- [Instructor Q&A dashboard](https://support.udemy.com/hc/en-us/articles/229606328-Instructor-Q-A-Dashboard)
- [Practice tests](https://support.udemy.com/hc/en-us/articles/1500006547442-How-to-Create-Practice-Tests-or-Practice-Test-Courses)
- [Course player](https://support.udemy.com/hc/en-us/sections/206457187-Course-Player)
- [Instructor dashboard insights](https://teach.udemy.com/publishing/using-your-dashboard/)
- [Pricing & coupons](https://support.udemy.com/hc/en-us/sections/206458388-Pricing-Coupons)
- [Refund policy](https://support.udemy.com/hc/en-us/articles/360050856093-Udemy-s-refund-policy)
- [Udemy Business — skills mapping & AI learning paths](https://business-support.udemy.com/hc/en-us/articles/26104712011671-Skills-mapping-and-AI-powered-learning-paths)
- [Udemy Business — AI Role Play](https://business.udemy.com/blog/ai-role-play-custom-skills-practice-for-enterprise/)
- [2026 instructor innovations — subscriptions, bundles, short-form](https://about.udemy.com/press-releases/udemy-introduces-new-instructor-innovations-at-semiannual-front-row-event/)
