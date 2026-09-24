<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GlobalMentor360v2 — agent notes

`next dev` upserts only the block above. Keep this section after the END marker.

This is one Next.js 16 App Router app. HTTP APIs are `app/api/` route handlers (plus `GET /certificates/[serial]/pdf`). There is no Express server.

- Certificate PDF already exists (`lib/pdf.ts`, `app/certificates/[serial]/pdf/route.ts`). `Certificate.pdfKey` is unused.
- Seed accounts: identify by email (`learner@example.com`, `instructor@example.com`, `admin@example.com`). Do not rename `User.name` to match a screenshot or certificate.
- Schema: `npm run db:migrate` only. `npm run db:push` drops `courses.search_vector` (generated tsvector + GIN indexes live in SQL migrations, not `schema.prisma`).
- `/admin/payments` is Approve/Reject of a pending bKash proof. It is not a student or course picker.
- SES is in sandbox (verified recipients only; production sending access was denied). Empty `EMAIL_FROM` prints mail to the dev console; production refuses that fallback.
- Video HTTP webhook (`POST /api/video/webhook`) waits for a public HTTPS domain. Local status uses SQS drain. Do not create an EventBridge Connection until that origin exists.

Owner status: `docs/PRODUCT-STATUS.md`.

UI/UX overhaul in progress (branch `claude/ui-ux-overhaul`): read `docs/superpowers/specs/2026-09-25-ui-ux-overhaul-design.md` first. It is the source of truth for the new design (tokens, type, shells, page plans, WCAG 2.2 AA bar), the phase order, and the progress log. `design-system/MASTER.md` describes the superseded teal/amber system.
