import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { pageHref, pageNavItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/**
 * Numbered pagination. Props and `?page=` contract are unchanged so every
 * wired list page picks this up without a route edit.
 */
export function PageNav({
  pathname,
  params,
  page,
  pageCount,
  pageParam = "page",
}: {
  pathname: string;
  params?: Record<string, string | undefined>;
  page: number;
  pageCount: number;
  /** Query key for the page number. Use something other than `page` when the URL already has a catalog pager. */
  pageParam?: string;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const { query } = pageHref(pathname, params ?? {}, target, pageParam);
    const search = new URLSearchParams(query).toString();
    return (search ? `${pathname}?${search}` : pathname) as Route;
  };

  const items = pageNavItems(page, pageCount);

  return (
    <nav aria-label="Pages" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      <span className="sr-only">
        page {page} of {pageCount}
      </span>

      {page > 1 ? (
        <Button asChild size="lg" variant="outline" className="min-h-11 px-3">
          <Link href={href(page - 1)} className="cursor-pointer">
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Link>
        </Button>
      ) : (
        <Button size="lg" variant="outline" className="min-h-11 px-3" disabled>
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Button>
      )}

      {items.map((item) =>
        item.kind === "ellipsis" ? (
          <span
            key={item.key}
            aria-hidden
            className="flex min-h-11 min-w-11 items-center justify-center text-graphite"
          >
            …
          </span>
        ) : item.page === page ? (
          <span
            key={item.page}
            aria-current="page"
            className={cn(
              buttonVariants({ variant: "default", size: "icon-lg" }),
              "pointer-events-none tabular-nums",
            )}
          >
            {item.page}
          </span>
        ) : (
          <Button key={item.page} asChild size="icon-lg" variant="outline" className="tabular-nums">
            <Link href={href(item.page)} className="cursor-pointer" aria-label={`Page ${item.page}`}>
              {item.page}
            </Link>
          </Button>
        ),
      )}

      {page < pageCount ? (
        <Button asChild size="lg" variant="outline" className="min-h-11 px-3">
          <Link href={href(page + 1)} className="cursor-pointer">
            Next
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Button>
      ) : (
        <Button size="lg" variant="outline" className="min-h-11 px-3" disabled>
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      )}
    </nav>
  );
}
