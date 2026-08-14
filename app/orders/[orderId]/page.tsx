import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/courses";
import { getLearnerOrder } from "@/lib/orders";
import { requireUser } from "@/lib/session";

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
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={"/orders" as Route}>
          <ChevronLeft className="size-4" aria-hidden /> All purchases
        </Link>
      </Button>

      <div className="rounded-2xl border p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Receipt</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Order {order.id} · {order.createdAt.toLocaleDateString("en-GB")}
            </p>
          </div>
          <Badge variant={order.status === "PAID" ? "default" : "secondary"}>
            {order.status.replace("_", " ").toLowerCase()}
          </Badge>
        </div>

        <Separator className="my-5" />

        <ol className="flex flex-col gap-3">
          {order.items.map((item) => (
            <li key={item.courseId} className="flex items-baseline justify-between gap-4">
              <Link
                href={`/courses/${item.courseSlug}` as Route}
                className="font-medium hover:text-brand hover:underline"
              >
                {item.courseTitle}
              </Link>
              <span className="tabular-nums">
                {formatPrice(item.unitPrice, order.currency)}
              </span>
            </li>
          ))}
        </ol>

        <Separator className="my-5" />

        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatPrice(order.subtotal, order.currency)}</dd>
          </div>
          {order.discount > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular-nums">−{formatPrice(order.discount, order.currency)}</dd>
            </div>
          ) : null}
          {order.tax > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular-nums">{formatPrice(order.tax, order.currency)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPrice(order.total, order.currency)}</dd>
          </div>
        </dl>

        {order.payments.length > 0 ? (
          <>
            <Separator className="my-5" />
            <h2 className="text-sm font-semibold">Payment</h2>
            <ul className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">
              {order.payments.map((payment, index) => (
                <li key={`${payment.method}-${index}`} className="flex flex-col">
                  <span>
                    {METHOD_LABEL[payment.method] ?? payment.method} ·{" "}
                    {payment.status.replace("_", " ").toLowerCase()}
                    {payment.paidAt ? ` · ${payment.paidAt.toLocaleDateString("en-GB")}` : ""}
                  </span>
                  {payment.reference ? (
                    <span className="break-all text-xs">Reference: {payment.reference}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </main>
  );
}
