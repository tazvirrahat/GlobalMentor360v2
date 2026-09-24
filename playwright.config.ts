import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./lib/test-database";

/**
 * Critical-path smoke tests. They run against their own `next dev` on port 3100
 * with its own dist dir (Next 16 allows one dev server per dist dir) and the
 * _test database, so a run never writes fixtures into the dev database the
 * developer is looking at on :3000.
 *
 * These are intentionally thin — they prove the happy path still wires end to
 * end, not that every edge case of the domain logic is covered (that's what
 * Vitest + the SQL constraint suite are for).
 */
const PORT = Number(process.env.E2E_PORT || 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
const DATABASE_URL = testDatabaseUrl();

// Worker processes inherit these: specs that open their own pg connection or
// build an Origin header read them.
process.env.DATABASE_URL = DATABASE_URL;
process.env.PLAYWRIGHT_BASE_URL = BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // The e2e server compiles each route on first visit; 5s is tight for that.
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // One worker: specs share one database, and qa-admin briefly unpublishes a
  // course that qa-studio lists. Parallel files raced on that.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Optional: a Chromium binary to use instead of Playwright's own download,
    // for machines whose pre-installed browser is a different revision.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL,
      NEXT_DIST_DIR: ".next-e2e",
      BETTER_AUTH_URL: BASE_URL,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      // Console mail fallback; never SES from a test run.
      EMAIL_FROM: "",
    },
  },
});
