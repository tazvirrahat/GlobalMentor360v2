import { describe, expect, it } from "vitest";
import {
  completionPercent,
  continueTargetId,
  isItemComplete,
  sequentialLockedIds,
} from "./progress";

const lecture = (
  id: string,
  overrides: Partial<Parameters<typeof sequentialLockedIds>[0][number]> = {},
) => ({
  id,
  type: "LECTURE",
  isPreview: false,
  lectureCompleted: false,
  assessmentPassed: false,
  ...overrides,
});

const quiz = (
  id: string,
  overrides: Partial<Parameters<typeof sequentialLockedIds>[0][number]> = {},
) => ({
  id,
  type: "QUIZ",
  isPreview: false,
  lectureCompleted: false,
  assessmentPassed: false,
  ...overrides,
});

describe("completionPercent edge cases", () => {
  it("is 100 when every item is complete", () => {
    expect(completionPercent(4, 4)).toBe(100);
    expect(completionPercent(1, 1)).toBe(100);
  });

  it("is 0 for an empty curriculum and for none-complete", () => {
    expect(completionPercent(0, 0)).toBe(0);
    expect(completionPercent(0, 3)).toBe(0);
  });
});

describe("mixed item types — quiz pass required", () => {
  it("does not count a quiz from a lecture-style progress row", () => {
    expect(
      isItemComplete({ type: "QUIZ", lectureCompleted: true, assessmentPassed: false }),
    ).toBe(false);
  });

  it("locks the lecture after an incomplete quiz", () => {
    const locked = sequentialLockedIds([
      lecture("a", { lectureCompleted: true }),
      quiz("q"),
      lecture("b"),
    ]);
    expect([...locked]).toEqual(["b"]);
    expect(locked.has("q")).toBe(false);
  });

  it("unlocks the following lecture only after the quiz is passed", () => {
    const locked = sequentialLockedIds([
      lecture("a", { lectureCompleted: true }),
      quiz("q", { assessmentPassed: true }),
      lecture("b"),
    ]);
    expect(locked.size).toBe(0);
  });
});

describe("sequential unlock / continueTargetId", () => {
  it("locks nothing when every required item is complete", () => {
    expect(
      sequentialLockedIds([
        lecture("a", { lectureCompleted: true }),
        lecture("b", { lectureCompleted: true }),
      ]).size,
    ).toBe(0);
  });

  it("returns null for an item that is not in the sequence", () => {
    expect(continueTargetId([lecture("a")], "missing")).toBeNull();
  });
});
