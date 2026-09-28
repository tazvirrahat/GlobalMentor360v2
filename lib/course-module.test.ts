import { describe, expect, it } from "vitest";
import { compactWindow, isGate, rowState, sectionMinutes, type ModuleRow, type ModuleSection } from "./course-module";

const row = (id: string, extra: Partial<ModuleRow> = {}): ModuleRow => ({
  id,
  title: id,
  type: "LECTURE",
  isPreview: false,
  durationSeconds: 300,
  ...extra,
});

describe("rowState", () => {
  it("puts the current row first, then locked, then done", () => {
    expect(rowState(row("a", { locked: true, completed: true }), "a")).toBe("current");
    expect(rowState(row("a", { locked: true, completed: true }), "b")).toBe("locked");
    expect(rowState(row("a", { completed: true }), "b")).toBe("done");
    expect(rowState(row("a"), null)).toBe("open");
  });
});

describe("isGate", () => {
  const rows = [
    row("l1", { completed: true }),
    row("q1", { type: "QUIZ" }),
    row("l2", { locked: true }),
  ];

  it("is an open, unpassed quiz with locked rows after it", () => {
    expect(isGate(rows, 1)).toBe(true);
  });

  it("is not a lecture, a passed quiz, or a quiz with nothing locked after it", () => {
    expect(isGate(rows, 0)).toBe(false);
    expect(isGate([rows[0]!, { ...rows[1]!, completed: true }, rows[2]!], 1)).toBe(false);
    expect(isGate([rows[0]!, rows[1]!, row("l2")], 1)).toBe(false);
    expect(isGate([rows[0]!, { ...rows[1]!, locked: true }, rows[2]!], 1)).toBe(false);
  });
});

describe("compactWindow", () => {
  const sections: ModuleSection[] = [
    { id: "s1", title: "One", items: [row("a", { completed: true }), row("b", { completed: true })] },
    {
      id: "s2",
      title: "Two",
      items: [
        row("c", { completed: true }),
        row("d", { completed: true }),
        row("e"),
        row("f", { locked: true }),
        row("g", { locked: true }),
        row("h", { locked: true }),
      ],
    },
  ];

  it("keeps the current row and at most one done row before it, inside its section", () => {
    const window = compactWindow(sections, "e", 4);
    expect(window?.section.id).toBe("s2");
    expect(window?.sectionIndex).toBe(1);
    expect(window?.rows.map((r) => r.id)).toEqual(["d", "e", "f", "g"]);
  });

  it("starts at the section's first row when the current row is first", () => {
    expect(compactWindow(sections, "a", 4)?.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("returns null for an unknown row", () => {
    expect(compactWindow(sections, "zzz")).toBeNull();
  });
});

describe("sectionMinutes", () => {
  it("sums lecture durations in whole minutes", () => {
    expect(sectionMinutes({ id: "s", title: "S", items: [row("a"), row("b", { durationSeconds: 90 }), row("q", { type: "QUIZ", durationSeconds: null })] })).toBe(7);
  });
});
