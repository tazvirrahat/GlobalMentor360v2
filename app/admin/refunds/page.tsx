import { FlashAlert } from "@/components/site/flash-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatPrice } from "@/lib/format";
import { listRefundableOrders } from "@/lib/refunds";
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
  const { items: orders, page, pageCount } = await listRefundableOrders(rawPage);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Refunds</h1>
      <p className="mt-1 text-muted-foreground">
        Record a refund and revoke course access. Money is returned out of band —
        this does not call Stripe or bKash.
      </p>
      {error ? <FlashAlert title="Could not refund">{error}</FlashAlert> : null}

      {orders.length === 0 ? (
        <p className="mt-8 text-muted-foreground">No paid orders to refund.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {orders.map((order) => (
            <li key={order.id}>
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>
                    {order.items.map((item) => item.course.title).join(", ") || "Order"}
                  </CardTitle>
                  <p className="min-w-0 break-words text-sm text-muted-foreground">
                    {order.user.name} · {order.user.email} ·{" "}
                    {formatPrice(order.total, order.currency)} ·{" "}
                    {formatDate(order.paidAt ?? order.createdAt)}
                  </p>
                </CardHeader>
                <CardContent>
                  <form action={refundOrderAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <input type="hidden" name="orderId" value={order.id} />
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`reason-${order.id}`}>Reason</Label>
                      <Input
                        id={`reason-${order.id}`}
                        name="reason"
                        required
                        maxLength={200}
                        placeholder="Learner requested a refund"
                      />
                    </div>
                    <Button type="submit" variant="outline">
                      Refund and revoke access
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <PageNav pathname="/admin/refunds" page={page} pageCount={pageCount} />
    </main>
  );
}
