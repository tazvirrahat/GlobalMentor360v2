/**
 * The integration suite, e2e and the volume fixture write real rows. They used
 * to share DATABASE_URL with `next dev`, which is how "vol- Catalog 49" and ten
 * copies of a Q&A question ended up on the home page. They now run against a
 * database whose name ends in `_test`, and refuse anything else.
 */
const SUFFIX = "_test";

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

export function deriveTestDatabaseUrl(value: string): string {
  const url = new URL(value);
  const name = databaseName(url);
  if (!name.endsWith(SUFFIX)) url.pathname = `/${name}${SUFFIX}`;
  return url.toString();
}

export function assertTestDatabaseUrl(value: string): void {
  const name = databaseName(new URL(value));
  if (!name.endsWith(SUFFIX)) {
    throw new Error(
      `Refusing to run against database "${name}". Test runs need a database whose name ends in ` +
        `"${SUFFIX}" so they never write fixtures into the dev database. Run \`npm run db:test:prepare\`.`,
    );
  }
}

type DatabaseEnv = Record<string, string | undefined>;

export function testDatabaseUrl(env: DatabaseEnv = process.env): string {
  const explicit = env.TEST_DATABASE_URL;
  const base = env.DATABASE_URL;
  if (!explicit && !base) {
    throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) — copy .env.example to .env.");
  }
  const url = explicit ?? deriveTestDatabaseUrl(base!);
  assertTestDatabaseUrl(url);
  return url;
}
