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

if (!process.env.DATABASE_URL) {
  throw new Error(
    "The integration suite runs against a real Postgres. Set DATABASE_URL " +
      "(docker compose up -d, then copy .env.example to .env) or run `npm run test` " +
      "for the unit suite, which needs no database.",
  );
}
