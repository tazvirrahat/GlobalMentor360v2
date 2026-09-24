import { describe, expect, it } from "vitest";
import { pickResumeItem } from "./continue-learning";

const item = (id: string, locked = false, completed = false) => ({ id, locked, completed });

describe("pickResumeItem", () => {
  it("opens the first unlocked lesson not yet done", () => {
    expect(pickResumeItem([item("a", false, true), item("b"), item("c", true)])).toBe("b");
  });

  it("falls back to the first unlocked lesson when everything open is done", () => {
    expect(pickResumeItem([item("a", false, true), item("b", false, true)])).toBe("a");
  });

  it("returns null for an empty or fully locked course", () => {
    expect(pickResumeItem([])).toBeNull();
    expect(pickResumeItem([item("a", true)])).toBeNull();
  });
});
