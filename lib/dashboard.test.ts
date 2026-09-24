import { describe, expect, it } from "vitest";
import { defaultLearningTab } from "./dashboard";

describe("defaultLearningTab", () => {
  it("opens the first tab that has something in it", () => {
    expect(defaultLearningTab({ inProgress: 2, completed: 1, archived: 0 })).toBe("in-progress");
    expect(defaultLearningTab({ inProgress: 0, completed: 1, archived: 3 })).toBe("completed");
    expect(defaultLearningTab({ inProgress: 0, completed: 0, archived: 3 })).toBe("archived");
  });

  it("falls back to in progress when everything is empty", () => {
    expect(defaultLearningTab({ inProgress: 0, completed: 0, archived: 0 })).toBe("in-progress");
  });
});
