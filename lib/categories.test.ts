import { describe, expect, it } from "vitest";
import { rollUpCategoryCounts, type CategoryNode } from "./categories";

const node = (id: string, name: string, parentId: string | null, position = 0): CategoryNode => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  parentId,
  position,
});

const nodes = [
  node("dev", "Development", null, 0),
  node("web", "Web Development", "dev", 0),
  node("data", "Data Science", "dev", 1),
  node("biz", "Business", null, 1),
  node("mgmt", "Management", "biz", 0),
  node("design", "Design", null, 2),
  node("ux", "UX Design", "design", 0),
];

describe("rollUpCategoryCounts", () => {
  it("adds children's courses to their parent and keeps the tree order", () => {
    const counts = new Map([
      ["web", 2],
      ["data", 2],
      ["mgmt", 1],
      ["dev", 1],
    ]);
    const result = rollUpCategoryCounts(nodes, counts);
    expect(result.map((c) => [c.name, c.count])).toEqual([
      ["Development", 5],
      ["Business", 1],
    ]);
    expect(result[0]!.children.map((c) => [c.name, c.count])).toEqual([
      ["Web Development", 2],
      ["Data Science", 2],
    ]);
  });

  it("drops branches with no published courses", () => {
    const result = rollUpCategoryCounts(nodes, new Map([["ux", 0]]));
    expect(result).toEqual([]);
  });
});
