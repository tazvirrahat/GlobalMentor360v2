import { describe, expect, it } from "vitest";
import { listRowLabel, moveId, pickEditorTab } from "./course-editor";

describe("pickEditorTab", () => {
  it("accepts the four in-page tabs", () => {
    expect(pickEditorTab("details")).toBe("details");
    expect(pickEditorTab("landing")).toBe("landing");
    expect(pickEditorTab("pricing")).toBe("pricing");
    expect(pickEditorTab("publish")).toBe("publish");
  });

  it("opens Details for anything else, including curriculum (its own page)", () => {
    expect(pickEditorTab(undefined)).toBe("details");
    expect(pickEditorTab("")).toBe("details");
    expect(pickEditorTab("curriculum")).toBe("details");
    expect(pickEditorTab("PRICING")).toBe("details");
  });

  it("reads the first value of a repeated param", () => {
    expect(pickEditorTab(["pricing", "landing"])).toBe("pricing");
  });
});

describe("listRowLabel", () => {
  it("numbers rows from 1", () => {
    expect(listRowLabel("Objective", 0)).toBe("Objective 1");
    expect(listRowLabel("Requirement", 11)).toBe("Requirement 12");
  });
});

describe("moveId", () => {
  const ids = ["a", "b", "c", "d"];
  it("moves a row down and up by insertion slot", () => {
    expect(moveId(ids, "a", 2)).toEqual(["b", "a", "c", "d"]);
    expect(moveId(ids, "a", 4)).toEqual(["b", "c", "d", "a"]);
    expect(moveId(ids, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveId(ids, "c", 1)).toEqual(["a", "c", "b", "d"]);
  });

  it("leaves the order alone for its own slots or an unknown id", () => {
    expect(moveId(ids, "b", 1)).toEqual(ids);
    expect(moveId(ids, "b", 2)).toEqual(ids);
    expect(moveId(ids, "z", 0)).toEqual(ids);
  });
});
