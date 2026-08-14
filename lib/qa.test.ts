import { describe, expect, it } from "vitest";
import {
  assembleThreads,
  QUESTION_TITLE_MAX,
  questionSubmissionSchema,
  replySubmissionSchema,
} from "./qa";

/**
 * The parts of Q&A that a database round trip only makes tedious to reach: what
 * the forms are allowed to post, and how a flat list of replies is folded back
 * onto its threads.
 *
 * The entitlement rules are not here — they are decisions about rows, and they
 * are covered against a real Postgres in tests/integration/course-qa.test.ts.
 * Faking `isEnrolled` to assert it was called would prove only that the mock
 * works.
 */

const at = (iso: string) => new Date(iso);

const thread = (id: string, curriculumItemId: string | null) => ({
  id,
  title: `Question ${id}`,
  body: "body",
  createdAt: at("2026-08-01T10:00:00Z"),
  curriculumItemId,
  user: { name: `Asker ${id}` },
});

const reply = (id: string, threadId: string, isInstructor = false) => ({
  id,
  threadId,
  body: `reply ${id}`,
  createdAt: at("2026-08-02T10:00:00Z"),
  isInstructor,
  user: { name: `Replier ${id}` },
});

describe("questionSubmissionSchema", () => {
  const valid = {
    courseId: "course-1",
    curriculumItemId: "item-1",
    scope: "LECTURE",
    title: "  How do generics work?  ",
    body: "  I read the chapter twice and still can't place the constraint.  ",
  };

  it("trims what a textarea actually posts", () => {
    const parsed = questionSubmissionSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.title).toBe("How do generics work?");
    expect(parsed.data?.body).toBe("I read the chapter twice and still can't place the constraint.");
  });

  it("refuses whitespace posing as a question", () => {
    // Without the trim running before the length check, "     " is five
    // characters and passes as a title.
    const parsed = questionSubmissionSchema.safeParse({ ...valid, title: "        " });
    expect(parsed.success).toBe(false);
  });

  it("refuses a title past the length the column and the form both assume", () => {
    const parsed = questionSubmissionSchema.safeParse({
      ...valid,
      title: "a".repeat(QUESTION_TITLE_MAX + 1),
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a scope it has no branch for", () => {
    // A scope the write does not understand would fall through to "not LECTURE"
    // and file a course-wide thread the asker did not ask for.
    expect(questionSubmissionSchema.safeParse({ ...valid, scope: "GLOBAL" }).success).toBe(false);
    expect(questionSubmissionSchema.safeParse({ ...valid, scope: "" }).success).toBe(false);
  });

  it("accepts a course-wide question with no lecture attached", () => {
    const parsed = questionSubmissionSchema.safeParse({
      ...valid,
      scope: "COURSE",
      curriculumItemId: "",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("replySubmissionSchema", () => {
  it("refuses an empty reply", () => {
    expect(replySubmissionSchema.safeParse({ threadId: "t1", body: "   " }).success).toBe(false);
  });

  it("refuses a reply with no thread to attach to", () => {
    expect(replySubmissionSchema.safeParse({ threadId: "", body: "Try it again." }).success).toBe(
      false,
    );
  });
});

describe("assembleThreads", () => {
  it("attaches each reply to its own thread", () => {
    const assembled = assembleThreads(
      [thread("t1", "item-1"), thread("t2", null)],
      [reply("r1", "t2"), reply("r2", "t1"), reply("r3", "t2")],
    );

    expect(assembled.map((t) => t.replies.map((r) => r.id))).toEqual([["r2"], ["r1", "r3"]]);
  });

  it("keeps the order the queries returned rather than re-sorting", () => {
    // The `orderBy` in getCourseQaPanel is the whole sort. If this function
    // reordered anything, the page's newest-first / oldest-first pairing would
    // be decided in two places.
    const assembled = assembleThreads(
      [thread("t2", null), thread("t1", "item-1")],
      [reply("r3", "t1"), reply("r1", "t1")],
    );

    expect(assembled.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(assembled[1]?.replies.map((r) => r.id)).toEqual(["r3", "r1"]);
  });

  it("gives a thread with no replies an empty list, not undefined", () => {
    const assembled = assembleThreads([thread("t1", "item-1")], []);
    expect(assembled[0]?.replies).toEqual([]);
  });

  it("derives the scope from the nullable item id", () => {
    const assembled = assembleThreads([thread("t1", "item-1"), thread("t2", null)], []);
    expect(assembled.map((t) => t.scope)).toEqual(["LECTURE", "COURSE"]);
  });

  it("does not leak the curriculum item id to the client", () => {
    // The page already knows which lecture it is showing; the only thing a
    // reader needs is which of the two lists a thread came from.
    const assembled = assembleThreads([thread("t1", "item-1")], []);
    expect(Object.keys(assembled[0] ?? {})).not.toContain("curriculumItemId");
  });

  it("carries the instructor flag through as stored", () => {
    const assembled = assembleThreads(
      [thread("t1", "item-1")],
      [reply("r1", "t1", true), reply("r2", "t1", false)],
    );
    expect(assembled[0]?.replies.map((r) => r.isInstructor)).toEqual([true, false]);
  });

  it("drops a reply whose thread is not on this page", () => {
    // Only threads that were fetched can be rendered; an orphan must not throw
    // or silently attach itself to the first thread.
    const assembled = assembleThreads([thread("t1", "item-1")], [reply("r1", "t-missing")]);
    expect(assembled[0]?.replies).toEqual([]);
  });
});
