import { describe, expect, it } from "vitest";
import { SEED_COURSES, SEED_LEARNERS } from "./seed-content";

const words = (s: string) => s.trim().split(/\s+/).length;

describe("seed content", () => {
  it("keeps the two slugs and prices the e2e suite depends on", () => {
    const ts = SEED_COURSES.find((c) => c.slug === "typescript-foundations");
    const sql = SEED_COURSES.find((c) => c.slug === "sql-for-analysts");
    expect([ts?.priceBdtMinor, ts?.priceUsdCents]).toEqual([599000, 4900]);
    expect([sql?.priceBdtMinor, sql?.priceUsdCents]).toEqual([399000, 3900]);
  });

  it("keeps the preview lessons the e2e suite opens", () => {
    const first = (slug: string) =>
      SEED_COURSES.find((c) => c.slug === slug)?.sections[0]?.lessons[0];
    expect(first("typescript-foundations")).toMatchObject({ title: "Why TypeScript", preview: true });
    expect(first("sql-for-analysts")).toMatchObject({ title: "Why SQL still matters", preview: true });
  });

  it("has six courses with unique slugs", () => {
    expect(SEED_COURSES).toHaveLength(6);
    expect(new Set(SEED_COURSES.map((c) => c.slug)).size).toBe(6);
  });

  it("has real article bodies, not placeholders", () => {
    for (const course of SEED_COURSES) {
      for (const section of course.sections) {
        for (const lesson of section.lessons) {
          if (lesson.kind !== "article") continue;
          expect(lesson.body, `${course.slug} / ${lesson.title}`).not.toMatch(/placeholder|lorem/i);
          expect(words(lesson.body), `${course.slug} / ${lesson.title}`).toBeGreaterThanOrEqual(80);
        }
      }
    }
  });

  it("gives every course objectives, requirements, audience, a preview and a quiz", () => {
    for (const c of SEED_COURSES) {
      expect(c.objectives.length, c.slug).toBeGreaterThanOrEqual(3);
      expect(c.requirements.length, c.slug).toBeGreaterThanOrEqual(1);
      expect(c.audience.length, c.slug).toBeGreaterThanOrEqual(1);
      const lessons = c.sections.flatMap((s) => s.lessons);
      expect(lessons.some((l) => l.kind === "article" && l.preview), c.slug).toBe(true);
      expect(lessons.some((l) => l.kind === "quiz"), c.slug).toBe(true);
    }
  });

  it("marks exactly one correct option on every question", () => {
    for (const c of SEED_COURSES)
      for (const s of c.sections)
        for (const l of s.lessons)
          if (l.kind === "quiz")
            for (const q of l.questions)
              expect(q.options.filter((o) => o.correct), q.prompt).toHaveLength(1);
  });

  it("reviews only name seeded courses, one per learner per course, with text", () => {
    const slugs = new Set(SEED_COURSES.map((c) => c.slug));
    for (const learner of SEED_LEARNERS) {
      const seen = new Set<string>();
      for (const r of learner.reviews) {
        expect(slugs.has(r.courseSlug), r.courseSlug).toBe(true);
        expect(seen.has(r.courseSlug)).toBe(false);
        seen.add(r.courseSlug);
        expect(words(r.body)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("never looks like a fixture", () => {
    const text = JSON.stringify({ SEED_COURSES, SEED_LEARNERS });
    expect(text).not.toMatch(/\bvol-|QA |\b\d{13}\b/);
  });
});
