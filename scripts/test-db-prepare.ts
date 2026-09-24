/**
 * Creates globalmentor360_test if missing, applies migrations, seeds it.
 * Safe to re-run. Never touches the dev database.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";
import { testDatabaseUrl } from "../lib/test-database";

const target = new URL(testDatabaseUrl());
const name = decodeURIComponent(target.pathname.slice(1));
const admin = new URL(target.toString());
admin.pathname = "/postgres";
admin.search = "";

const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
try {
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (exists.rowCount === 0) {
    // Identifiers cannot be bound parameters; testDatabaseUrl() checked the name ends in _test.
    await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    console.log(`Created ${name}.`);
  }
} finally {
  await client.end();
}

const env = { ...process.env, DATABASE_URL: target.toString() };
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("npx prisma db seed", { stdio: "inherit", env });
console.log(`${name} is migrated and seeded.`);
