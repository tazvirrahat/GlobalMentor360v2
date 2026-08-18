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
): { pathname: string; query: Record<string, string> } {
  const next = { ...params, page: page <= 1 ? undefined : String(page) };
  const query = Object.fromEntries(
    Object.entries(next).filter((pair): pair is [string, string] => Boolean(pair[1])),
  );
  return { pathname, query };
}
