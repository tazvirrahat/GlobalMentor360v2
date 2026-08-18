/**
 * Environment for the database-backed integration suite.
 *
 * Loaded *after* `dotenv/config` (see setupFiles in vitest.integration.config.ts)
 * because its job is to override .env rather than fall back to it. The checked-in
 * .env ships `STRIPE_SECRET_KEY=""` and `STRIPE_WEBHOOK_SECRET=""`, and empty
 * strings are falsy: `stripeRail.isConfigured()` returns false and `confirm()`
 * returns null before it ever looks at the body. Without this file the whole
 * webhook suite would pass by never running its subject — the exact shape of
 * decorative coverage docs/PRIOR-ART.md is about.
 *
 * The override is unconditional, not "only when unset", for two reasons:
 *   - the signature the tests generate and the signature the rail verifies must
 *     come from the same secret, whatever a developer has in their .env;
 *   - a real key in someone's environment must never be picked up by a test run.
 *
 * Nothing here contacts Stripe. Both `generateTestHeaderString` and
 * `constructEvent` are local HMAC over the request bytes, which is what makes
 * these tests runnable in CI with no Stripe account and no network.
 */
process.env.STRIPE_SECRET_KEY = "sk_test_integration_suite_key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_integration_suite_secret";

// Never call SES from this suite. An empty EMAIL_FROM makes sesConfigured()
// false, so sendEmail uses the console fallback instead of AWS.
process.env.EMAIL_FROM = "";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "The integration suite runs against a real Postgres. Set DATABASE_URL " +
      "(docker compose up -d, then copy .env.example to .env) or run `npm run test` " +
      "for the unit suite, which needs no database.",
  );
}

/*
 * Leftover hygiene (local QA DB only — never truncate seed).
 *
 * `analytics_events` has no FK, so a crashed run that deleted users first
 * leaves orphan rows. Tests that grant enrollment or call `recordEvent` must
 * `analyticsEvent.deleteMany` in `afterAll`. Do not `TRUNCATE analytics_events`:
 * seed and manual QA (learner@example.com lecture/quiz events, admin grants)
 * live in the same table.
 *
 * Coupon prefixes this suite owns: APPR, CAP, CART, GRD, INV + the run id.
 * Seed coupon is SAVE10. UI QA coupons look like QAINS* and hang off leftover
 * `qa-*-draft-*` courses — do not DELETE those unless you are sure they are
 * test-only. Inspect with:
 *
 *   SELECT count(*) FROM analytics_events e
 *     LEFT JOIN users u ON u.id = e."userId"
 *     WHERE e."userId" IS NOT NULL AND u.id IS NULL;
 *   SELECT code FROM coupons WHERE code <> 'SAVE10' ORDER BY code;
 */
