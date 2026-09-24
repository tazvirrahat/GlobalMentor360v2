import type { Metadata, Route } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatPrice } from "@/lib/format";
import { listLearnerOrders, ORDER_PAGE_SIZE } from "@/lib/orders";
import { showingRange } from "@/lib/pagination";
import { requireUser } from "@/lib/session";
import { EmptyState } from "@/components/site/empty-state";
import { PageNav } from "@/components/site/page-nav";
import { OrderStatusBadge } from "@/components/site/status-badges";

export const metadata: Metadata = { title: "Purchases" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser("/orders");
  const { page: rawPage } = await searchParams;
  const { items: orders, page, pageCount, total } = await listLearnerOrders(user.id, rawPage);
  const range = showingRange(page, ORDER_PAGE_SIZE, total);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Purchases</h1>
        <p className="mt-1 text-muted-foreground">
          Every order you have placed, and what happened to it.
        </p>
        {total > 0 ? (
          <p className="mt-2 text-sm tabular-nums text-muted-foreground">
            Showing {range.from}–{range.to} of {total} · {ORDER_PAGE_SIZE} per page
          </p>
        ) : null}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-6" aria-hidden />}
          title="No purchases yet"
          message="You haven't bought anything yet."
        >
          <Button asChild>
            <Link href="/courses" className="cursor-pointer">
              Browse courses
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <ol className="overflow-hidden rounded-lg border bg-card shadow-xs">
          {orders.map((order) => {
            const title = order.items.map((item) => item.courseTitle).join(", ") || "Order";
            return (
              <li
                key={order.id}
                className="flex min-h-12 flex-col gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" title={title}>
                    {title}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </p>
                </div>
                <p className="text-right text-sm font-semibold tabular-nums sm:w-28">
                  {formatPrice(order.total, order.currency)}
                </p>
                <OrderStatusBadge status={order.status} />
                <Button asChild variant="outline" size="sm" className="w-fit shrink-0">
                  <Link href={`/orders/${order.id}` as Route} className="cursor-pointer">
                    <Receipt className="size-4" aria-hidden /> View receipt
                  </Link>
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {pageCount > 1 ? (
        <div className="rounded-lg border bg-card px-4 py-4 shadow-sm [&_nav]:mt-3">
          <p className="text-center text-sm font-medium tabular-nums">
            Page {page} of {pageCount} · {ORDER_PAGE_SIZE} per page
          </p>
          <PageNav pathname="/orders" page={page} pageCount={pageCount} />
        </div>
      ) : (
        <PageNav pathname="/orders" page={page} pageCount={pageCount} />
      )}
    </main>
  );
}
