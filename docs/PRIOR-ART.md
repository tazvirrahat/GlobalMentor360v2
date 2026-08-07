# Prior Art — what to take from the earlier builds

Two earlier codebases exist. This records what is worth reusing, what to avoid repeating, and which
already-provisioned infrastructure v2 can adopt.

| Repo | What it is | Relevance |
|---|---|---|
| `GitHub/globalmentor360` | Next.js + Supabase + AWS course platform. 25 tables, service/repository architecture, AWS media stack, Lambda/SQS workers, CDK. | High — same domain |
| `GitHub/v3` | Lovable + Vite + Supabase student marketplace for physical goods. | Low — different domain, some transferable patterns |

**No code is being ported.** v2 keeps its own stack (Next 16, Prisma 7, Better Auth, Postgres). What
follows are ideas and infrastructure, not files.

> **Contains no secrets.** Environment variable *names* appear below; values do not, and must not be
> added. See [Credential hygiene](#credential-hygiene).

---

## Ideas worth taking

### 1. Conditional CHECK constraints for multi-method payments ⭐

The single best thing in either codebase. The old `payments` table enforces method-specific
requirements in the database rather than in application code:

```sql
-- bKash payments must carry a transaction id and phone number
CHECK (payment_method != 'bkash_transfer' OR transaction_id IS NOT NULL)
CHECK (payment_method != 'bkash_transfer' OR phone_number ~ '^01\d{9}$')

-- bKash is always BDT
CHECK (payment_method != 'bkash_transfer' OR currency = 'BDT')

-- A bKash payment cannot reach 'completed' without a recorded human verifier
CHECK (payment_method != 'bkash_transfer'
       OR status != 'completed'
       OR verified_by IS NOT NULL)
```

The `A != x OR <requirement>` shape is how you express "this field is required only for this
variant" in a single table without a nullable free-for-all.

That last constraint is the one to internalise: it makes "someone marked a manual payment as paid
without anyone actually verifying it" **structurally impossible**, not merely discouraged. Manual
payment verification is exactly where fraud and honest mistakes both live, and it's the kind of rule
that erodes the moment it lives only in a service method.

Adopted in v2 — see [TECH-SPEC.md](TECH-SPEC.md#payments) and catalog section I.

### 2. QR forensic watermarking instead of DRM ⭐

`lib/services/qr-watermark.service.ts` renders a QR code onto content that looks like an ordinary
link to the site, but base64url-encodes `userId`, `userEmail`, content id, page number, and a
timestamp.

This directly answers the problem in
[TECH-SPEC.md](TECH-SPEC.md#what-content-protection-actually-costs): real Widevine/FairPlay DRM
costs $99/mo plus per-license fees, and we deferred it to P3.

Watermarking is a different strategy with a different economics profile. DRM tries to *prevent*
copying and fails against a camera pointed at a screen. Forensic watermarking accepts that leaks
happen and makes them **attributable** — when content surfaces where it shouldn't, the watermark
identifies the account it came from. For a paid course platform, the deterrent of "we will know it
was you" is often worth more per dollar than encryption.

It also composes with signed URLs, which we already ship, and costs essentially nothing.

Worth promoting into P1/P2 as the pragmatic middle ground between signed URLs alone and paying for
Enterprise DRM.

### 3. Spend kill switches

Two independent cost-control mechanisms, both worth copying because video is the dominant cost line:

- **`lambda/cloudfront-disable-on-quota`** — disables the CloudFront distribution outright when a
  billing alarm fires. A hard ceiling on a runaway bill rather than an email you read the next
  morning.
- **`lib/services/auto-shutdown.service.ts`** — stops IVS compositions when a stage is empty for N
  minutes, or when only the host remains. Live sessions bill continuously; the failure mode is an
  instructor forgetting to hit stop and a stage running all weekend.

The second one only matters once live classes land (P3), but the first applies to any CDN-delivered
video and should be set up before the first real traffic.

### 4. Async work belongs on a queue

Three SQS-backed Lambda processors: `email-job-processor`, `certificate-job-processor`,
`webhook-job-processor`. Certificate generation in particular is slow, failure-prone, and must not
block a request — our own spec calls for generating certificates async, and this confirms the shape.

v2 already plans Redis + BullMQ for this, which is the same pattern with fewer moving parts and no
AWS coupling. Keep BullMQ; take the job breakdown.

### 5. Server-side price computation with row locks

From `v3`'s `place_order`: prices are read from the database inside the transaction with
`SELECT ... FOR UPDATE` on both product and coupon rows. Never trusts a client-supplied price.

This is the same class of rule as v2's entitlement invariant, and it is the reason invariant 6 now
exists in [TECH-SPEC.md](TECH-SPEC.md#invariants).

### 6. Coupon validation, fully worked

`v3` handles expiry, max total uses, one-per-user via a `coupon_usage` table, and minimum order
amount — with the coupon row locked `FOR UPDATE` so concurrent redemptions can't oversell a limited
code. v2 has coupons at P1 with the same requirements; this is a working reference for the race
conditions.

---

## Traps to avoid repeating

### Payment confirmation that depends on the browser

`v3` confirms orders **only** in a `verify-payment` function the browser calls after Stripe
redirects. There is no webhook. Pay, close the tab, and the order stays `pending` forever — which is
why a `cancel_unpaid_order` sweeper had to exist.

This is now invariant 5 in [TECH-SPEC.md](TECH-SPEC.md#invariants).

**Note the newer repo only half-fixes this.** `globalmentor360` does have a Stripe webhook, but it
runs `@supabase/stripe-sync-engine`, which mirrors Stripe objects into tables. Syncing payment data
is not the same as granting entitlement. Confirm that *something* creates the enrollment, or the same
bug returns wearing a webhook.

### Client-supplied money parameters

`v3`'s `place_order` accepts `_shipping_fee` and `_tax_rate` as RPC arguments. They default to `0`
and the UI doesn't send them, so nothing is lost today — but the function is callable directly. The
moment real shipping or tax is charged from the client, a user passes zeros and pays neither.

A defaulted parameter is still a parameter.

### Architecture that outruns implementation

`globalmentor360` has a clean, well-documented layered architecture where several core paths are
hollow:

| Module | Reality |
|---|---|
| `lib/services/business/payment.service.ts` | Stripe entirely mocked — returns `'mock_client_secret'` |
| `lib/aws/content-protection/drm.service.ts` | 41 lines, `// For now, placeholder` |
| `lib/aws/content-protection/watermark.service.ts` | `// placeholder - implement actual watermarking logic` |
| `lib/services/live-class.service.ts` | TODOs where persistence should be |

Meanwhile `mediaconvert.service.ts` (310 lines), `ivs-realtime.service.ts` (326), and the repository
layer are genuinely built. The interfaces and factories make it read finished from the outside.

The lesson is about sequencing, not about the abstractions — which are good. Build one path all the
way through before laying the next set of interfaces. v2's verification gates exist for this reason:
a phase isn't done until its slice of the E2E suite is green.

### Documentation sprawl

215 files in `docs/`, including eight separate `AMPLIFY_ENV_VARS_*` documents. That's not
documentation, it's a record of repeatedly fighting the same configuration problem. When a doc needs
a fourth variant, the underlying setup is what needs fixing.

---

## Infrastructure that already exists

All provisioned and reusable. **Every credential must be rotated first** — see below.

| Resource | Env var name | Use in v2 |
|---|---|---|
| S3 bucket | `AWS_S3_BUCKET` / `S3_BUCKET` | Lecture resources, captions, certificate PDFs |
| CloudFront + signing key pair | `CLOUDFRONT_DISTRIBUTION_ID`, `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY` | Signed playback URLs — a direct alternative to Bunny |
| MediaConvert | `AWS_MEDIACONVERT_ENDPOINT`, `AWS_MEDIACONVERT_ROLE_ARN` | VOD transcoding to HLS |
| IVS Real-time | `IVS_REALTIME_STAGE_ARN`, `IVS_STORAGE_CONFIG_ARN` | Live classes — **P3**, but note Bunny cannot do live at all |
| MediaPackage | `MEDIAPACKAGE_*` (7 vars) | Packaging / origin endpoints |
| SQS | `SQS_EMAIL_QUEUE_URL`, `SQS_CERTIFICATE_QUEUE_URL`, `SQS_WEBHOOK_QUEUE_URL` | Async jobs, if not using BullMQ |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, keys | **Its Postgres can back v2 directly** — Prisma connects to it like any Postgres |
| SSM Parameter Store | — | Config management for Lambdas |

### Two practical consequences

**The Supabase Postgres can be v2's database today.** Supabase is Postgres. Point `DATABASE_URL` at
it and skip Docker for a hosted dev environment — use a separate schema so the old tables don't
collide.

**The video decision is worth revisiting once live classes get real.** v2 chose Bunny Stream on cost.
That still holds for on-demand. But live classes are P3 and **Bunny has no live streaming at any
price**, whereas IVS is already provisioned here. When P3 arrives the options are Bunny + a live
provider, or consolidating on AWS (MediaConvert + CloudFront + IVS). The `VideoProvider` interface in
`lib/video/provider.ts` exists precisely so that stays a contained decision.

---

## Credential hygiene

`temp_env_parsed.json` and `temp_env_vars.txt` are committed to `globalmentor360` and pushed to
`origin/main`. The repo is private, but the files contain six populated secrets including
`SUPABASE_SERVICE_ROLE_KEY` (bypasses all RLS), `AWS_SECRET_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY`, and
`CLOUDFRONT_PRIVATE_KEY`.

`.gitignore` there lists `.env*`, which only matches filenames *beginning* with `.env` —
`temp_env_vars.txt` was never covered.

**Rotate all six before reusing any of the infrastructure above.** Deleting the files in a new commit
does not remove them from history.

v2's `.gitignore` covers `.env`, `.env.local`, and `.env.*.local`. Anything holding secrets must
match one of those patterns or be added explicitly — do not rely on a name merely *looking*
temporary.
