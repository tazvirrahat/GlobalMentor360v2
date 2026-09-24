import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/site/empty-state";
import { FlashAlert } from "@/components/site/flash-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatPrice } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { listRefundableOrders, REFUND_PAGE_SIZE } from "@/lib/refunds";
import { requireRole } from "@/lib/session";
import { refundOrderAction } from "../actions";
import { PageNav } from "@/components/site/page-nav";

export const metadata = { title: "Refunds — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; page?: string }>;
}) {
  await requireRole("ADMIN");
  const { error, page: rawPage } = await searchParams;
  const { items: orders, total, page, pageCount } = await listRefundableOrders(rawPage);
  const range = showingRange(page, REFUND_PAGE_SIZE, total);

  const pager = (
    <>
      {orders.length > 0 ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          Showing {range.from}–{range.to} of {total}
        </p>
      ) : null}
      <PageNav pathname="/admin/refunds" page={page} pageCount={pageCount} />
    </>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Refunds</h1>
      <p className="mt-1 text-muted-foreground">
        Record a refund and revoke course access. Money is returned out of band —
        this does not call Stripe or bKash.
      </p>
      {error ? <FlashAlert title="Could not refund">{error}</FlashAlert> : null}

      {orders.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<Receipt className="size-6" />}
          title="No paid orders"
          message="Paid orders appear here so you can record a refund and revoke access."
        />
      ) : (
        <div className="mt-4 min-w-0 space-y-2">
          {pager}
          <div className="w-0 min-w-full overflow-x-auto rounded-lg border bg-card shadow-sm">
            <ul>
              {orders.map((order) => {
                const courses = order.items.map((item) => item.course.title).join(", ") || "Order";
                return (
                  <li key={order.id} className="border-b px-3 py-2 last:border-b-0 hover:bg-muted/50">
                    <div className="flex min-w-[40rem] items-center gap-x-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate"
                          title={`${courses} · ${order.user.name} · ${order.user.email}`}
                        >
                          <span className="font-medium">{courses}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {order.user.name} · {order.user.email} ·{" "}
                            <span className="tabular-nums">
                              {formatDate(order.paidAt ?? order.createdAt)}
                            </span>
                          </span>
                        </p>
                      </div>
                      <p className="text-right font-semibold tabular-nums">
                        {formatPrice(order.total, order.currency)}
                      </p>
                      <form
                        action={refundOrderAction}
                        className="flex min-w-[16rem] flex-[2] items-center gap-2"
                      >
                        <input type="hidden" name="orderId" value={order.id} />
                        <Label htmlFor={`reason-${order.id}`} className="sr-only">
                          Reason
                        </Label>
                        <Input
                          id={`reason-${order.id}`}
                          name="reason"
                          required
                          maxLength={200}
                          placeholder="Reason"
                          className="h-8 min-w-[10rem] flex-1"
                        />
                        <Button type="submit" size="sm" variant="destructive">
                          Refund and revoke access
                        </Button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          {pager}
        </div>
      )}
    </main>
  );
}
