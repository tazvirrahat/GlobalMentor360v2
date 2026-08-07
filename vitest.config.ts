import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    environment: "node",
    setupFiles: ["dotenv/config"],
    include: ["**/*.test.ts"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "generated/**",
      "globalmentor360/**",
      ".claude/**",
      "e2e/**",
    ],
  },
});
