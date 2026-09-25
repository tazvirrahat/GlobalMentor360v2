import type { Route } from "next";
import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { Price } from "@/components/course/price";
import { EmptyState } from "@/components/site/empty-state";
import { FlashAlert } from "@/components/site/flash-alert";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateMedium, formatPrice } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { listRefundableOrders, REFUND_PAGE_SIZE } from "@/lib/refunds";
import { requireRole } from "@/lib/session";
import { RefundDialog } from "./refund-dialog";

export const metadata = { title: "Refunds | Admin" };
export const dynamic = "force-dynamic";

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; page?: string; q?: string }>;
}) {
  await requireRole("ADMIN");
  const { error, page: rawPage, q } = await searchParams;
  const query = q?.trim() || undefined;
  const { items: orders, total, page, pageCount } = await listRefundableOrders(query, rawPage);
  const range = showingRange(page, REFUND_PAGE_SIZE, total);

  return (
    <main className="flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Refunds"
        description="Recording a refund removes the learner's access. Send the money back through Stripe or bKash yourself."
      />
      {error ? <FlashAlert title="Could not refund">{error}</FlashAlert> : null}

      <SearchBox
        action={"/admin/refunds" as Route}
        label="Search paid orders"
        placeholder="Learner name or email, or course title"
        value={query}
      />

      {orders.length === 0 ? (
        query ? (
          <EmptyState title="No paid orders match" message={`Nothing matches “${query}”. Try another search.`} />
        ) : (
          <EmptyState title="No paid orders" message="Paid orders appear here so you can record a refund." />
        )
      ) : (
        <>
          <Table className="md:min-w-[46rem]">
            <TableCaption>Paid orders</TableCaption>
            <colgroup>
              <col />
              <col className="hidden w-56 md:table-column" />
              <col className="hidden w-32 md:table-column" />
              <col className="hidden w-28 md:table-column" />
              <col className="w-28 md:w-32" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="hidden md:table-cell">Learner</TableHead>
                <TableHead className="hidden md:table-cell">Paid</TableHead>
                <TableHead className="hidden text-right md:table-cell">Amount</TableHead>
                <TableHead>
                  <span className="sr-only">Refund</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const courses = order.items.map((item) => item.course.title).join(", ") || "Order";
                const paid = order.paidAt ?? order.createdAt;
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium text-ink">{courses}</span>
                        <span className="flex flex-col text-sm text-graphite md:hidden">
                          <span className="break-all">{order.user.email}</span>
                          <span>
                            <Price amount={order.total} currency={order.currency} className="text-ink" /> paid{" "}
                            {formatDateMedium(paid)}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="flex min-w-0 flex-col">
                        <span className="text-ink">{order.user.name}</span>
                        <span className="text-sm break-all text-graphite">{order.user.email}</span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-graphite md:table-cell">
                      <time dateTime={paid.toISOString()}>{formatDateMedium(paid)}</time>
                    </TableCell>
                    <TableCell className="hidden text-right font-semibold md:table-cell">
                      <Price amount={order.total} currency={order.currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RefundDialog
                        orderId={order.id}
                        learner={order.user.email}
                        summary={`${order.user.name} paid ${formatPrice(order.total, order.currency)} for ${courses}.`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ListFooter
            range={range}
            total={total}
            pathname="/admin/refunds"
            params={{ q: query }}
            page={page}
            pageCount={pageCount}
          />
        </>
      )}
    </main>
  );
}
