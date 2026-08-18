import { describe, expect, it } from "vitest";
import {
  completionPercent,
  continueTargetId,
  creditWatchedSeconds,
  isItemComplete,
  passedAssessmentIds,
  resolveCompletedAt,
  sequentialItemFromPlayer,
  sequentialLockedIds,
} from "./progress";

/**
 * These lock down the rules the player and the rollup have to share.
 *
 * Every function under test is imported from ./progress — an earlier version of
 * this file defined its own copies of the two completion derivations and asserted
 * they agreed, which proved only that two test-local functions matched each other.
 * Reverting the production rule would have left the suite green, which is worse
 * than no test at all because it reads as coverage.
 */

type Attempt = { assessmentId: string; passed: boolean | null };

describe("completionPercent", () => {
  it("is 0 when nothing is complete, even if a leftover rollup said 75", () => {
    expect(completionPercent(0, 4)).toBe(0);
    expect(completionPercent(0, 4)).not.toBe(75);
  });

  it("matches the rollup formula for a 3-of-4 course", () => {
    expect(completionPercent(3, 4)).toBe(75);
  });

  it("is 0 for an empty curriculum", () => {
    expect(completionPercent(0, 0)).toBe(0);
  });
});

describe("isItemComplete", () => {
  it("counts a lecture only once its progress row is completed", () => {
    expect(
      isItemComplete({ type: "LECTURE", lectureCompleted: false, assessmentPassed: false }),
    ).toBe(false);
    expect(
      isItemComplete({ type: "LECTURE", lectureCompleted: true, assessmentPassed: false }),
    ).toBe(true);
  });

  it("counts a quiz on a pass, ignoring any lecture-style progress row", () => {
    expect(
      isItemComplete({ type: "QUIZ", lectureCompleted: true, assessmentPassed: false }),
    ).toBe(false);
    expect(
      isItemComplete({ type: "QUIZ", lectureCompleted: false, assessmentPassed: true }),
    ).toBe(true);
  });

  it("treats a practice test like a quiz", () => {
    expect(
      isItemComplete({ type: "PRACTICE_TEST", lectureCompleted: false, assessmentPassed: true }),
    ).toBe(true);
  });

  it("keeps a quiz complete after a failed retake", () => {
    // Pass, then practise again and fail. The old player read the latest attempt
    // and re-locked everything after it while course_progress stayed at 100%.
    // Attempts arrive newest-first, as getPlayerCourse orders them.
    const attempts: Attempt[] = [
      { assessmentId: "quiz-1", passed: false },
      { assessmentId: "quiz-1", passed: true },
    ];

    expect(
      isItemComplete({
        type: "QUIZ",
        lectureCompleted: false,
        assessmentPassed: passedAssessmentIds(attempts).has("quiz-1"),
      }),
    ).toBe(true);
  });

  it("leaves a never-passed quiz incomplete", () => {
    const attempts: Attempt[] = [{ assessmentId: "quiz-1", passed: false }];
    expect(passedAssessmentIds(attempts).has("quiz-1")).toBe(false);
  });
});

describe("passedAssessmentIds", () => {
  it("is order-independent, so newest-first and oldest-first agree", () => {
    const newestFirst: Attempt[] = [
      { assessmentId: "quiz-1", passed: false },
      { assessmentId: "quiz-1", passed: true },
    ];
    const oldestFirst = [...newestFirst].reverse();
    expect([...passedAssessmentIds(newestFirst)]).toEqual([...passedAssessmentIds(oldestFirst)]);
  });

  it("ignores unsubmitted attempts, where passed is null", () => {
    expect(passedAssessmentIds([{ assessmentId: "quiz-1", passed: null }]).size).toBe(0);
  });

  it("collapses repeat passes to one entry", () => {
    const ids = passedAssessmentIds([
      { assessmentId: "quiz-1", passed: true },
      { assessmentId: "quiz-1", passed: true },
      { assessmentId: "quiz-2", passed: true },
    ]);
    expect([...ids].sort()).toEqual(["quiz-1", "quiz-2"]);
  });
});

describe("resolveCompletedAt", () => {
  const first = new Date("2026-01-01T00:00:00.000Z");
  const middle = new Date("2026-03-01T00:00:00.000Z");
  const last = new Date("2026-06-01T00:00:00.000Z");
  const fallback = new Date("2026-09-09T00:00:00.000Z");

  it("dates completion from the last contributing item", () => {
    expect(resolveCompletedAt(100, [first, last, middle], fallback)).toEqual(last);
  });

  it("is order-independent, so a rebuild lands on the same answer", () => {
    const forwards = resolveCompletedAt(100, [first, middle, last], fallback);
    const backwards = resolveCompletedAt(100, [last, middle, first], fallback);
    expect(forwards).toEqual(backwards);
  });

  it("is stable across repeated recomputes — the date never walks forward", () => {
    // The original bug: every recompute at 100% stamped the current time.
    const once = resolveCompletedAt(100, [first, last], fallback);
    const twice = resolveCompletedAt(100, [first, last], new Date("2027-01-01T00:00:00.000Z"));
    expect(once).toEqual(twice);
  });

  it("clears when the course grows and percent drops below 100", () => {
    expect(resolveCompletedAt(87.5, [first, last], fallback)).toBeNull();
  });

  it("stays null while the course is unfinished", () => {
    expect(resolveCompletedAt(0, [], fallback)).toBeNull();
  });

  it("falls back to now for a complete course with no timestamps", () => {
    expect(resolveCompletedAt(100, [], fallback)).toEqual(fallback);
    expect(resolveCompletedAt(100, [null], fallback)).toEqual(fallback);
  });
});

describe("sequentialLockedIds", () => {
  const lecture = (id: string, overrides: Partial<Parameters<typeof sequentialLockedIds>[0][number]> = {}) => ({
    id,
    type: "LECTURE",
    isPreview: false,
    lectureCompleted: false,
    assessmentPassed: false,
    ...overrides,
  });

  it("leaves the first item unlocked and locks everything after an incomplete item", () => {
    const locked = sequentialLockedIds([lecture("a"), lecture("b"), lecture("c")]);
    expect([...locked]).toEqual(["b", "c"]);
  });

  it("unlocks the next item once the previous one is complete", () => {
    const locked = sequentialLockedIds([
      lecture("a", { lectureCompleted: true }),
      lecture("b"),
      lecture("c"),
    ]);
    expect([...locked]).toEqual(["c"]);
  });

  it("keeps preview items playable even when the gate is shut", () => {
    const locked = sequentialLockedIds([
      lecture("a"),
      lecture("preview", { isPreview: true }),
      lecture("c"),
    ]);
    expect(locked.has("preview")).toBe(false);
    expect(locked.has("c")).toBe(true);
  });
});

describe("continueTargetId", () => {
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

  it("continues to the sequential next item even while it is still locked", () => {
    // The player computed "next" from items already unlocked, so an incomplete
    // lesson had no continue target — completing it opened the next item after
    // the Continue click had already decided there was nowhere to go.
    const items = [lecture("a"), lecture("b"), lecture("c")];
    expect([...sequentialLockedIds(items)]).toEqual(["b", "c"]);
    expect(continueTargetId(items, "a")).toBe("b");
  });

  it("does not skip a locked next lesson to a later unlocked preview", () => {
    const items = [
      lecture("a"),
      lecture("b"),
      lecture("preview", { isPreview: true }),
    ];
    expect(sequentialLockedIds(items).has("preview")).toBe(false);
    expect(continueTargetId(items, "a")).toBe("b");
  });

  it("keeps items beyond the sequential next locked after this completion", () => {
    const items = [
      lecture("a"),
      lecture("b"),
      lecture("c"),
      lecture("preview", { isPreview: true }),
    ];
    expect(continueTargetId(items, "a")).toBe("b");
    expect(continueTargetId(items, "a")).not.toBe("preview");
    expect(continueTargetId(items, "a")).not.toBe("c");
  });

  it("returns null when completing the current item still leaves the rest gated", () => {
    // On a mid-sequence preview while an earlier required item is incomplete,
    // finishing the preview does not open the following required item.
    const items = [
      lecture("a"),
      lecture("preview", { isPreview: true }),
      lecture("c"),
    ];
    expect(continueTargetId(items, "preview")).toBeNull();
  });

  it("continues to the next item once the current one is already complete", () => {
    const items = [
      lecture("a", { lectureCompleted: true }),
      lecture("b"),
      lecture("c"),
    ];
    expect(continueTargetId(items, "a")).toBe("b");
  });

  it("returns null on the last item", () => {
    expect(continueTargetId([lecture("a")], "a")).toBeNull();
  });

  it("treats completing a quiz as opening the following lecture", () => {
    const items = [
      {
        id: "quiz",
        type: "QUIZ",
        isPreview: false,
        lectureCompleted: false,
        assessmentPassed: false,
      },
      lecture("b"),
    ];
    expect(continueTargetId(items, "quiz")).toBe("b");
  });

  it("maps player completed flags onto sequential state", () => {
    const items = [
      sequentialItemFromPlayer({ id: "a", type: "LECTURE", isPreview: false, completed: false }),
      sequentialItemFromPlayer({ id: "b", type: "LECTURE", isPreview: false, completed: false }),
      sequentialItemFromPlayer({
        id: "preview",
        type: "LECTURE",
        isPreview: true,
        completed: false,
      }),
    ];
    expect(continueTargetId(items, "a")).toBe("b");
  });
});

describe("creditWatchedSeconds", () => {
  const lecture = { durationSeconds: 600 };

  it("gives no credit for the first report, which only sets the baseline", () => {
    expect(
      creditWatchedSeconds({
        previousWatchedSeconds: 0,
        previousPositionSeconds: 0,
        positionSeconds: 12,
        secondsSinceLastReport: null,
        ...lecture,
      }),
    ).toBe(0);
  });

  it("credits normal playback between two reports", () => {
    expect(
      creditWatchedSeconds({
        previousWatchedSeconds: 30,
        previousPositionSeconds: 30,
        positionSeconds: 45,
        secondsSinceLastReport: 15,
        ...lecture,
      }),
    ).toBe(45);
  });

  it("refuses to complete a lecture that was seeked to the end", () => {
    // The whole point: the playhead jumped 9 minutes but no time passed.
    const watched = creditWatchedSeconds({
      previousWatchedSeconds: 0,
      previousPositionSeconds: 0,
      positionSeconds: 590,
      secondsSinceLastReport: 0.4,
      ...lecture,
    });
    expect(watched).toBe(0);
    expect(watched).toBeLessThan(600 * 0.9);
  });

  it("caps a run of seeks at what the wall clock allows", () => {
    // 15s between reports buys at most 30s of playhead at the 2x speed ceiling.
    expect(
      creditWatchedSeconds({
        previousWatchedSeconds: 100,
        previousPositionSeconds: 100,
        positionSeconds: 540,
        secondsSinceLastReport: 15,
        ...lecture,
      }),
    ).toBe(130);
  });

  it("does not bank a long idle gap", () => {
    // Ten minutes parked on the page then a seek to the end: the gap is clamped
    // to 60s, so it is worth 120s of credit, not 600.
    expect(
      creditWatchedSeconds({
        previousWatchedSeconds: 0,
        previousPositionSeconds: 0,
        positionSeconds: 600,
        secondsSinceLastReport: 600,
        ...lecture,
      }),
    ).toBe(120);
  });

  it("earns nothing for scrubbing backwards, and never shrinks", () => {
    expect(
      creditWatchedSeconds({
        previousWatchedSeconds: 200,
        previousPositionSeconds: 200,
        positionSeconds: 20,
        secondsSinceLastReport: 15,
        ...lecture,
      }),
    ).toBe(200);
  });

  it("clamps the total to the lecture duration", () => {
    expect(
      creditWatchedSeconds({
        previousWatchedSeconds: 595,
        previousPositionSeconds: 595,
        positionSeconds: 620,
        secondsSinceLastReport: 25,
        ...lecture,
      }),
    ).toBe(600);
  });

  it("leaves the total unclamped when the asset has no duration yet", () => {
    expect(
      creditWatchedSeconds({
        previousWatchedSeconds: 10,
        previousPositionSeconds: 10,
        positionSeconds: 25,
        secondsSinceLastReport: 15,
        durationSeconds: 0,
      }),
    ).toBe(25);
  });

  it("accrues a full honest watch across successive reports", () => {
    let watched = 0;
    let position = 0;
    // First report establishes the baseline (the player fires one on play).
    watched = creditWatchedSeconds({
      previousWatchedSeconds: watched,
      previousPositionSeconds: position,
      positionSeconds: position,
      secondsSinceLastReport: null,
      ...lecture,
    });

    for (let i = 0; i < 40; i += 1) {
      const next = position + 15;
      watched = creditWatchedSeconds({
        previousWatchedSeconds: watched,
        previousPositionSeconds: position,
        positionSeconds: next,
        secondsSinceLastReport: 15,
        ...lecture,
      });
      position = next;
    }

    expect(watched).toBe(600);
  });
});
