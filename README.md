# GlobalMentor360

An online learning platform for Bangladesh. Learners browse courses, pay in taka
with bKash (or by card through Stripe), watch video and article lessons, pass
section quizzes, and receive a certificate that anyone can verify online.
Instructors build courses in a studio; admins approve payments and manage the
catalog.

## Features

**Learners**
- Course catalog with full-text search, filters (subject, level, price, rating, language, duration) and sorting
- Course pages with curriculum, free preview lessons, FAQ, instructor profile and reviews
- Cart, coupons, bKash checkout (transaction ID verified by an admin) and Stripe card checkout
- Lesson player: HLS video with captions, transcripts and quality selection, article lessons, notes, Q&A and announcements
- Lessons unlock in order; each section can end with a quiz
- Progress tracking, "My learning" dashboard, orders and printable receipts
- Certificates with a public verification page and PDF download
- Account settings, sessions, notification preferences

**Instructors**
- Course editor: details, landing page, pricing, thumbnail and promo video
- Curriculum builder with drag-and-drop (and keyboard) reordering
- Video upload (resumable) with automatic transcoding, lesson files and links, quiz builder
- Q&A inbox, announcements, coupons, review replies, course analytics
- Public instructor profile

**Admins**
- Payment verification queue (approve / reject bKash payments)
- Refunds, users (suspend, grant access, read-only "view as"), courses (review, feature)
- Categories and topics, video processing status, review moderation

## Tech stack

| Area | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, Radix UI components |
| Database | PostgreSQL 16 with [Prisma 7](https://www.prisma.io) |
| Authentication | [Better Auth](https://www.better-auth.com) (email and password, email verification, roles) |
| Video | AWS S3, MediaConvert (HLS), CloudFront signed URLs, SQS |
| Email | Amazon SES |
| Payments | bKash (manual verification), Stripe Checkout |
| Testing | Vitest (unit and integration), Playwright (end-to-end), axe-core (accessibility) |

## Project structure

```
app/
  (site)/          Public pages and learner account: home, catalog, course, cart, checkout, dashboard
  (learn)/         Lesson player
  (app)/studio/    Instructor studio
  (app)/admin/     Admin console
  api/             Route handlers: auth, webhooks (Stripe, video), captions, uploads
components/
  ui/              Base components (buttons, inputs, dialogs, tabs, tables)
  course/          Course cards, curriculum, certificate, prices
  site/            Header, footer, navigation, shared page pieces
lib/               Domain logic: courses, enrollment, progress, payments, reviews, email, video
prisma/            Schema, migrations, seed data and SQL constraint tests
tests/integration/ Database-backed integration tests
e2e/               Playwright end-to-end tests
scripts/           Maintenance and verification scripts, UI accessibility audit
docs/              Technical specification and product documentation
```

## Getting started

### Prerequisites

- Node.js 20 or newer
- Docker (for the local PostgreSQL database), or any PostgreSQL 16 server

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Create your environment file and fill in the values
cp .env.example .env

# 4. Create the database tables
npm run db:migrate

# 5. Load sample courses and accounts
npm run db:seed

# 6. Start the development server
npm run dev
```

Open http://localhost:3000.

AWS, Stripe and bKash settings are optional for local development. Without an
email sender configured, emails are printed to the terminal.

### Sample accounts

After seeding, all accounts use the password `dev-password-12345`:

| Email | Role |
|---|---|
| `learner@example.com` | Learner (one course completed, one in progress) |
| `instructor@example.com` | Instructor |
| `admin@example.com` | Admin |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm test` | Unit tests |
| `npm run db:test:prepare` | Create and seed the separate test database |
| `npm run test:db` | Database constraint and integration tests |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run ui-audit` | Accessibility and layout audit of every page |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Load sample data |

Tests run against a separate `globalmentor360_test` database and never touch
development data.

## Deployment

The app runs as a Node.js server (`npm run build` then `npm start`) with a
PostgreSQL database. On a production server, apply migrations with
`npx prisma migrate deploy`. Environment variables are listed in
`.env.example`. Video, email and payments require AWS, SES, Stripe and bKash
credentials, and the Stripe and video webhooks need a public HTTPS domain.

## Documentation

- [Technical specification](docs/TECH-SPEC.md)
- [Feature catalog](docs/FEATURES.md)
- [Product status](docs/PRODUCT-STATUS.md)
