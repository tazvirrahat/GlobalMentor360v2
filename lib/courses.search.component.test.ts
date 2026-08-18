import { describe, expect, it } from "vitest";
import { sanitizeSearchQuery } from "./courses";

/**
 * The catalog's FTS query is a Prisma tagged template (`${query}` / `${pattern}`),
 * so values are bound as parameters rather than concatenated. sanitizeSearchQuery
 * is the remaining string-level defence: operators that would make
 * websearch_to_tsquery throw are stripped before they reach SQL.
 */
describe("sanitizeSearchQuery injection surface", () => {
  it("strips SQL metacharacters that are not valid search text", () => {
    const cleaned = sanitizeSearchQuery("foo'; DROP TABLE courses; --");
    expect(cleaned).not.toContain(";");
    expect(cleaned).toContain("foo");
    expect(cleaned).toContain("DROP TABLE courses");
    // Apostrophes stay — instructor names like O'Brien are legitimate query text.
    // They cannot inject SQL: searchPublishedCourseIds binds the string as a parameter.
    expect(cleaned).toContain("'");
    expect(sanitizeSearchQuery('typescript" OR 1=1')).toBe("typescript OR 1 1");
  });

  it("strips ILIKE wildcards so a query of % or _ cannot be used as a wildcard", () => {
    expect(sanitizeSearchQuery("%")).toBe("");
    expect(sanitizeSearchQuery("_")).toBe("");
    expect(sanitizeSearchQuery("type%script")).toBe("type script");
  });

  it("strips tsquery operators that would make websearch_to_tsquery throw", () => {
    expect(sanitizeSearchQuery("foo & (bar | baz)")).toBe("foo bar baz");
    expect(sanitizeSearchQuery("!!!")).toBe("");
  });

  it("caps the query so a pasted blob cannot become a 10k-character tsquery", () => {
    expect(sanitizeSearchQuery("ab".repeat(200)).length).toBe(200);
  });
});
