import { db } from "@/lib/db";

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
};

export type CategoryCount = {
  name: string;
  slug: string;
  count: number;
  children: { name: string; slug: string; count: number }[];
};

const byPosition = (a: CategoryNode, b: CategoryNode) => a.position - b.position || a.name.localeCompare(b.name);

/**
 * Top-level categories with how many published courses sit in them or their
 * subcategories. A course belongs to one (usually leaf) category; a subject
 * like "Development" counts its children's courses. Empty branches are
 * dropped: an empty category is a dead end on a storefront.
 */
export function rollUpCategoryCounts(nodes: CategoryNode[], counts: Map<string, number>): CategoryCount[] {
  const roots = nodes.filter((node) => node.parentId === null).sort(byPosition);
  const out: CategoryCount[] = [];
  for (const root of roots) {
    const children = nodes
      .filter((node) => node.parentId === root.id)
      .sort(byPosition)
      .map((child) => ({ name: child.name, slug: child.slug, count: counts.get(child.id) ?? 0 }))
      .filter((child) => child.count > 0);
    const count = (counts.get(root.id) ?? 0) + children.reduce((sum, child) => sum + child.count, 0);
    if (count > 0) out.push({ name: root.name, slug: root.slug, count, children });
  }
  return out;
}

/** Subjects for the home page and the catalog's category filter. Two queries. */
export async function listTopCategoriesWithCounts(): Promise<CategoryCount[]> {
  const [nodes, groups] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, slug: true, parentId: true, position: true } }),
    db.course.groupBy({
      by: ["primaryCategoryId"],
      where: { status: "PUBLISHED", primaryCategoryId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map<string, number>();
  for (const group of groups) {
    if (group.primaryCategoryId) counts.set(group.primaryCategoryId, group._count._all);
  }
  return rollUpCategoryCounts(nodes, counts);
}
