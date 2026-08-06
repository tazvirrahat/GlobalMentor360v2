import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the migrate/introspect connection string out of schema.prisma.
// The runtime client is configured separately in lib/db.ts via a driver adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
