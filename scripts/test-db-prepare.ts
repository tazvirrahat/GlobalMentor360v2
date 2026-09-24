/**
 * Creates globalmentor360_test if missing, applies migrations, seeds it.
 * Safe to re-run. Never touches the dev database.
 *
 * --fresh drops and recreates the test database first (only ever a *_test
 * database: testDatabaseUrl() refuses anything else).
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

const fresh = process.argv.includes("--fresh");
const quoted = `"${name.replace(/"/g, '""')}"`;

const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
try {
  if (fresh) {
    // Identifiers cannot be bound parameters; testDatabaseUrl() checked the name ends in _test.
    await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    console.log(`Dropped ${name}.`);
  }
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE ${quoted}`);
    console.log(`Created ${name}.`);
  }
} finally {
  await client.end();
}

const env = { ...process.env, DATABASE_URL: target.toString() };
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("npx prisma db seed", { stdio: "inherit", env });
console.log(`${name} is migrated and seeded.`);
