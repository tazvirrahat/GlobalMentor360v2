import { describe, expect, it } from "vitest";
import { listRowLabel, pickEditorTab } from "./course-editor";

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
