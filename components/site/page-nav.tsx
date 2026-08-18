import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pageHref } from "@/lib/pagination";

/**
 * Prev / next + "page X of Y". Numbered page buttons grow with the list;
 * two links do not.
 */
export function PageNav({
  pathname,
  params,
  page,
  pageCount,
}: {
  pathname: string;
  params?: Record<string, string | undefined>;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const { query } = pageHref(pathname, params ?? {}, target);
    const search = new URLSearchParams(query).toString();
    return (search ? `${pathname}?${search}` : pathname) as Route;
  };

  return (
    <nav aria-label="Pages" className="mt-8 flex flex-wrap items-center gap-3">
      {page > 1 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={href(page - 1)}>Previous</Link>
        </Button>
      ) : null}
      <p className="text-sm text-muted-foreground">
        page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <Button asChild size="sm" variant="outline">
          <Link href={href(page + 1)}>Next</Link>
        </Button>
      ) : null}
    </nav>
  );
}
