import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The database-backed suite, deliberately separate from vitest.config.ts.
 *
 * `npm run test` must stay a pure-unit, no-Postgres loop — that is what makes it
 * runnable on a laptop with nothing installed and in CI jobs that have no
 * database service. These tests write real rows through the real rails, so they
 * live behind their own config and their own script (`npm run test:db:flows`),
 * alongside the SQL constraint suites in prisma/tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    environment: "node",
    // Order matters: setup.ts overrides values dotenv has just loaded.
    setupFiles: ["dotenv/config", "./tests/integration/setup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    // Each file opens its own Prisma pool and writes real rows; the default 5s
    // is tight on a cold connection.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
