import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl, deriveTestDatabaseUrl, testDatabaseUrl } from "./test-database";

const DEV = "postgresql://postgres:postgres@localhost:5432/globalmentor360?schema=public";

describe("deriveTestDatabaseUrl", () => {
  it("appends _test to the database name and keeps the query", () => {
    expect(deriveTestDatabaseUrl(DEV)).toBe(
      "postgresql://postgres:postgres@localhost:5432/globalmentor360_test?schema=public",
    );
  });

  it("is idempotent", () => {
    const once = deriveTestDatabaseUrl(DEV);
    expect(deriveTestDatabaseUrl(once)).toBe(once);
  });
});

describe("assertTestDatabaseUrl", () => {
  it("refuses the dev database", () => {
    expect(() => assertTestDatabaseUrl(DEV)).toThrow(/_test/);
  });

  it("accepts a _test database", () => {
    expect(() => assertTestDatabaseUrl(deriveTestDatabaseUrl(DEV))).not.toThrow();
  });
});

describe("testDatabaseUrl", () => {
  it("prefers TEST_DATABASE_URL", () => {
    const url = "postgresql://u:p@db:5432/other_test";
    expect(testDatabaseUrl({ TEST_DATABASE_URL: url, DATABASE_URL: DEV })).toBe(url);
  });

  it("derives from DATABASE_URL", () => {
    expect(testDatabaseUrl({ DATABASE_URL: DEV })).toMatch(/\/globalmentor360_test\?/);
  });

  it("refuses a TEST_DATABASE_URL that is not a test database", () => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: DEV })).toThrow(/_test/);
  });

  it("explains itself when nothing is set", () => {
    expect(() => testDatabaseUrl({})).toThrow(/DATABASE_URL/);
  });
});
