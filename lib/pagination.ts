/**
 * Shared `?page=` math for every bounded list.
 *
 * Caps without a second page hide older rows (admin refunds, order history) and
 * make a count lie. One parse / skip / "page X of Y" pair keeps those surfaces
 * honest without a different dialect per route.
 */

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
};

export function parsePage(raw: string | number | null | undefined): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

export function pageCount(total: number, pageSize: number): number {
  if (pageSize < 1) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function skipTake(page: number, pageSize: number): { skip: number; take: number } {
  const current = parsePage(page);
  return { skip: (current - 1) * pageSize, take: pageSize };
}

export function clampPage(
  requested: string | number | null | undefined,
  total: number,
  pageSize: number,
): number {
  return Math.min(parsePage(requested), pageCount(total, pageSize));
}

export function showingRange(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const { skip, take } = skipTake(page, pageSize);
  if (skip >= total) return { from: 0, to: 0 };
  return { from: skip + 1, to: Math.min(skip + take, total) };
}

export function pageHref(
  pathname: string,
  params: Record<string, string | undefined>,
  page: number,
  pageKey = "page",
): { pathname: string; query: Record<string, string> } {
  const next = { ...params, [pageKey]: page <= 1 ? undefined : String(page) };
  const query = Object.fromEntries(
    Object.entries(next).filter((pair): pair is [string, string] => Boolean(pair[1])),
  );
  return { pathname, query };
}

export type PageNavItem =
  | { kind: "page"; page: number }
  | { kind: "ellipsis"; key: string };

/**
 * Numbered pager window: all pages when there are ≤7; otherwise first,
 * current±1, last, with ellipses in the gaps. Hidden entirely when
 * pageCount ≤ 1 (the component short-circuits before calling this).
 */
export function pageNavItems(page: number, pageCount: number): PageNavItem[] {
  if (pageCount <= 1) return [];
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => ({
      kind: "page" as const,
      page: index + 1,
    }));
  }

  const wanted = new Set<number>([1, pageCount]);
  for (let n = page - 1; n <= page + 1; n++) {
    if (n >= 1 && n <= pageCount) wanted.add(n);
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const items: PageNavItem[] = [];
  let previous = 0;
  for (const n of sorted) {
    if (previous > 0 && n - previous > 1) {
      items.push({ kind: "ellipsis", key: `${previous}-${n}` });
    }
    items.push({ kind: "page", page: n });
    previous = n;
  }
  return items;
}
