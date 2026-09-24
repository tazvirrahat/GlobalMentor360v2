import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/format";
import { getLearnerOrder } from "@/lib/orders";
import { requireUser } from "@/lib/session";
import { StatusBadge } from "@/components/course/status-badge";
import { Price } from "@/components/course/price";
import { Serial } from "@/components/course/serial";

export const metadata: Metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orderId: string }> };

const METHOD_LABEL: Record<string, string> = {
  STRIPE: "Card",
  BKASH: "bKash",
};

export default async function ReceiptPage({ params }: Params) {
  const { orderId } = await params;
  const user = await requireUser(`/orders/${orderId}`);

  // Scoped to this learner inside the lookup, so another learner's order id is
  // a 404 rather than a receipt showing what they paid.
  const order = await getLearnerOrder(user.id, orderId);
  if (!order) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Button asChild variant="ghost" className="w-fit">
        <Link href={"/orders" as Route} className="cursor-pointer">
          <ChevronLeft className="size-4" aria-hidden /> All purchases
        </Link>
      </Button>

      <article className="rounded-lg border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Receipt
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-graphite">
              <span>Order</span>
              <Serial value={order.id} copyLabel="order number" size="sm" />
            </p>
            <p className="text-sm text-graphite">
              <time dateTime={order.createdAt.toISOString()}>{formatDate(order.createdAt)}</time>
            </p>
          </div>
          <StatusBadge kind="order" status={order.status} />
        </div>

        <Separator className="my-5" />

        <ol className="flex flex-col gap-3">
          {order.items.map((item) => (
            <li key={item.courseId} className="flex items-baseline justify-between gap-4">
              <Link
                href={`/courses/${item.courseSlug}` as Route}
                className="min-w-0 truncate font-medium hover:text-primary hover:underline"
                title={item.courseTitle}
              >
                {item.courseTitle}
              </Link>
              <span className="shrink-0 text-right tabular-nums">
                <Price amount={item.unitPrice} currency={order.currency} />
              </span>
            </li>
          ))}
        </ol>

        <Separator className="my-5" />

        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-right tabular-nums"><Price amount={order.subtotal} currency={order.currency} /></dd>
          </div>
          {order.discount > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="text-right tabular-nums">−<Price amount={order.discount} currency={order.currency} /></dd>
            </div>
          ) : null}
          {order.tax > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="text-right tabular-nums"><Price amount={order.tax} currency={order.currency} /></dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 text-base font-semibold">
            <dt>Total</dt>
            <dd className="text-right tabular-nums"><Price amount={order.total} currency={order.currency} /></dd>
          </div>
        </dl>

        {order.payments.length > 0 ? (
          <>
            <Separator className="my-5" />
            <h2 className="font-heading text-sm font-semibold tracking-tight">Payment</h2>
            <ul className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">
              {order.payments.map((payment, index) => (
                <li key={`${payment.method}-${index}`} className="flex flex-col">
                  <span>
                    {METHOD_LABEL[payment.method] ?? payment.method} ·{" "}
                    {payment.status.replace("_", " ").toLowerCase()}
                    {payment.paidAt ? ` · ${formatDate(payment.paidAt)}` : ""}
                  </span>
                  {payment.reference ? (
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span>Transaction ID</span>
                      <Serial value={payment.reference} copyLabel="transaction ID" size="sm" />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </article>
    </main>
  );
}
