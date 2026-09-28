import { PageNav } from "@/components/site/page-nav";

/**
 * Under a table, never above it: where you are in the list, then the
 * pager. Renders nothing for a list that fits on one page.
 */
export function ListFooter({
  range,
  total,
  pathname,
  params,
  page,
  pageCount,
}: {
  range: { from: number; to: number };
  total: number;
  pathname: string;
  params?: Record<string, string | undefined>;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex flex-col items-center gap-3 [&_nav]:mt-0">
      <p className="text-sm text-graphite">
        Showing {range.from} to {range.to} of {total}
      </p>
      <PageNav pathname={pathname} params={params} page={page} pageCount={pageCount} />
    </div>
  );
}
