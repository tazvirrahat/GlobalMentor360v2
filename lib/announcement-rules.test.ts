import { describe, expect, it } from "vitest";
import { pickDefaultAnnouncementCourseId } from "./announcement-rules";

/**
 * The composer must not default to whichever course was touched last. Editing a
 * 0-learner draft bumps updatedAt, and posting then silently targets that draft.
 */

describe("pickDefaultAnnouncementCourseId", () => {
  it("does not pick a freshly updated empty draft when a published course has learners", () => {
    expect(
      pickDefaultAnnouncementCourseId([
        { id: "draft", status: "DRAFT", learnerCount: 0 },
        { id: "live", status: "PUBLISHED", learnerCount: 1 },
      ]),
    ).toBe("live");
  });

  it("falls back to a published course when none have learners", () => {
    expect(
      pickDefaultAnnouncementCourseId([
        { id: "draft", status: "DRAFT", learnerCount: 0 },
        { id: "pub", status: "PUBLISHED", learnerCount: 0 },
      ]),
    ).toBe("pub");
  });

  it("prefers published-with-learners over a published empty course", () => {
    expect(
      pickDefaultAnnouncementCourseId([
        { id: "empty-pub", status: "PUBLISHED", learnerCount: 0 },
        { id: "live", status: "PUBLISHED", learnerCount: 4 },
      ]),
    ).toBe("live");
  });

  it("prefers a published empty course over an unpublished course that still has learners", () => {
    expect(
      pickDefaultAnnouncementCourseId([
        { id: "unpub", status: "UNPUBLISHED", learnerCount: 3 },
        { id: "pub", status: "PUBLISHED", learnerCount: 0 },
      ]),
    ).toBe("pub");
  });

  it("falls back to the first owned course when none are published", () => {
    expect(
      pickDefaultAnnouncementCourseId([
        { id: "newer-draft", status: "DRAFT", learnerCount: 0 },
        { id: "older-draft", status: "DRAFT", learnerCount: 0 },
      ]),
    ).toBe("newer-draft");
  });

  it("is undefined when the instructor owns nothing", () => {
    expect(pickDefaultAnnouncementCourseId([])).toBeUndefined();
  });
});
