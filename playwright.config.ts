import { defineConfig, devices } from "@playwright/test";

/**
 * Critical-path smoke tests against a running `npm run dev` (or `npm start`).
 * These are intentionally thin — they prove the happy path still wires end to
 * end, not that every edge case of the domain logic is covered (that's what
 * Vitest + the SQL constraint suite are for).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
