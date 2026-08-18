import type { Metadata, Route } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatPrice } from "@/lib/format";
import { listLearnerOrders } from "@/lib/orders";
import { requireUser } from "@/lib/session";
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
  const { items: orders, page, pageCount } = await listLearnerOrders(user.id, rawPage);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Purchases</h1>
        <p className="mt-1 text-muted-foreground">
          Every order you have placed, and what happened to it.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border p-6">
          <p className="text-muted-foreground">You haven&rsquo;t bought anything yet.</p>
          <Button asChild variant="outline">
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {orders.map((order) => (
            <li key={order.id}>
              <Card className="rounded-2xl">
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">
                        {order.items.map((item) => item.courseTitle).join(", ") || "Order"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(order.createdAt)} ·{" "}
                        {formatPrice(order.total, order.currency)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>

                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <Link href={`/orders/${order.id}` as Route}>
                      <Receipt className="size-4" aria-hidden /> View receipt
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
      <PageNav pathname="/orders" page={page} pageCount={pageCount} />
    </main>
  );
}
