import type { Metadata, Route } from "next";
import Link from "next/link";
import { Price } from "@/components/course/price";
import { StatusBadge } from "@/components/course/status-badge";
import { PageNav } from "@/components/site/page-nav";
import { Button } from "@/components/ui/button";
import { formatDateMedium } from "@/lib/format";
import { listLearnerOrders, ORDER_PAGE_SIZE } from "@/lib/orders";
import { showingRange } from "@/lib/pagination";
import { requireUser } from "@/lib/session";
import { getViewerTimeZone } from "@/lib/viewer-time";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

/** Every order this learner placed, newest first, with its status in the colour it means. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser("/orders");
  const timeZone = await getViewerTimeZone();
  const { page: rawPage } = await searchParams;
  const { items: orders, page, pageCount, total } = await listLearnerOrders(user.id, rawPage);
  const range = showingRange(page, ORDER_PAGE_SIZE, total);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">Orders</h1>
        <p className="text-lg text-graphite">Everything you have bought, and what happened to each payment.</p>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-6">
          <h2 className="text-lg font-semibold">No orders yet</h2>
          <p className="text-graphite">When you buy a course, its receipt appears here.</p>
          <Button asChild>
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop: a real table, fixed columns so rows line up. */}
          <table className="hidden w-full table-fixed border-collapse text-sm md:table">
            <caption className="sr-only">Your orders</caption>
            <colgroup>
              <col />
              <col className="w-32" />
              <col className="w-28" />
              <col className="w-40" />
              <col className="w-32" />
            </colgroup>
            <thead>
              <tr className="border-b border-rule text-left text-graphite">
                <th scope="col" className="py-2.5 pr-4 font-semibold">
                  Courses
                </th>
                <th scope="col" className="py-2.5 pr-4 font-semibold">
                  Date
                </th>
                <th scope="col" className="py-2.5 pr-4 text-right font-semibold">
                  Total
                </th>
                <th scope="col" className="py-2.5 pr-4 font-semibold">
                  Status
                </th>
                <th scope="col" className="py-2.5 font-semibold">
                  <span className="sr-only">Receipt</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-rule align-middle hover:bg-wash/60">
                  <td className="py-3 pr-4 font-medium text-ink">
                    {order.items.map((item) => item.courseTitle).join(", ") || "Order"}
                  </td>
                  <td className="py-3 pr-4 text-graphite">
                    <time dateTime={order.createdAt.toISOString()}>{formatDateMedium(order.createdAt, timeZone)}</time>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <Price amount={order.total} currency={order.currency} className="font-semibold" />
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge kind="order" status={order.status} />
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/orders/${order.id}` as Route}
                      className="inline-flex min-h-8 items-center rounded-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                    >
                      View receipt
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phones: the same orders as a list. */}
          <ul className="flex flex-col divide-y divide-rule border-y border-rule md:hidden">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-2 py-4">
                <p className="font-medium text-ink">{order.items.map((item) => item.courseTitle).join(", ") || "Order"}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <Price amount={order.total} currency={order.currency} className="font-semibold" />
                  <StatusBadge kind="order" status={order.status} />
                  <time className="text-graphite" dateTime={order.createdAt.toISOString()}>
                    {formatDateMedium(order.createdAt, timeZone)}
                  </time>
                </div>
                <Link
                  href={`/orders/${order.id}` as Route}
                  className="inline-flex min-h-8 w-fit items-center rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                >
                  View receipt
                </Link>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <p className="text-sm text-graphite">
              Showing {range.from} to {range.to} of {total}
            </p>
          ) : null}
          <PageNav pathname="/orders" page={page} pageCount={pageCount} />
        </>
      )}
    </main>
  );
}
