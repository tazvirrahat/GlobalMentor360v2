import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CircleX } from "lucide-react";
import { Price } from "@/components/course/price";
import { Serial } from "@/components/course/serial";
import { StatusBadge } from "@/components/course/status-badge";
import { PrintButton } from "@/components/site/print-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDateMedium } from "@/lib/format";
import { getLearnerOrder } from "@/lib/orders";
import { requireUser } from "@/lib/session";
import { getSite } from "@/lib/site";

export const metadata: Metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orderId: string }> };

const METHOD_LABEL: Record<string, string> = {
  STRIPE: "Card",
  BKASH: "bKash",
};

function Row({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 text-base font-semibold" : "flex justify-between gap-4"}>
      <dt className={strong ? "text-ink" : "text-graphite"}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

/** A printable receipt. A rejected bKash payment says why, and how to pay again. */
export default async function ReceiptPage({ params }: Params) {
  const { orderId } = await params;
  const user = await requireUser(`/orders/${orderId}`);

  // Scoped to this learner inside the lookup, so another learner's order id is
  // a 404 rather than a receipt showing what they paid.
  const order = await getLearnerOrder(user.id, orderId);
  if (!order) notFound();

  const rejected = order.payments.find((payment) => payment.rejectReason);
  const firstCourse = order.items[0];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" className="-ml-3">
          <Link href={"/orders" as Route}>
            <ChevronLeft aria-hidden /> All orders
          </Link>
        </Button>
        <PrintButton />
      </div>

      {rejected ? (
        <Alert variant="destructive" className="print:hidden">
          <CircleX className="size-4" />
          <AlertTitle>This payment was not accepted</AlertTitle>
          <AlertDescription>
            <p>{rejected.rejectReason}</p>
            {firstCourse ? (
              <Button asChild size="sm" className="mt-2">
                <Link href={`/courses/${firstCourse.courseSlug}/checkout` as Route}>Pay again</Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <article className="flex flex-col gap-6 rounded-lg border border-rule bg-surface p-6 sm:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-ink">{getSite().name}</p>
            <h1 className="text-3xl font-semibold">Receipt</h1>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-graphite">
              <span>Order</span>
              <Serial value={order.id} copyLabel="order number" size="sm" />
            </p>
            <p className="text-sm text-graphite">
              <time dateTime={order.createdAt.toISOString()}>{formatDateMedium(order.createdAt)}</time>
            </p>
          </div>
          <StatusBadge kind="order" status={order.status} />
        </header>

        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {order.items.map((item) => (
            <li key={item.courseId} className="flex items-baseline justify-between gap-4 py-3">
              <Link
                href={`/courses/${item.courseSlug}` as Route}
                className="min-w-0 rounded-sm font-medium text-ink hover:underline focus-ring"
              >
                {item.courseTitle}
              </Link>
              <Price amount={item.unitPrice} currency={order.currency} className="shrink-0" />
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1.5 text-sm">
          <Row label="Subtotal">
            <Price amount={order.subtotal} currency={order.currency} />
          </Row>
          {order.discount > 0 ? (
            <Row label="Discount">
              −<Price amount={order.discount} currency={order.currency} />
            </Row>
          ) : null}
          {order.tax > 0 ? (
            <Row label="Tax">
              <Price amount={order.tax} currency={order.currency} />
            </Row>
          ) : null}
          <Row label="Total" strong>
            <Price amount={order.total} currency={order.currency} />
          </Row>
        </dl>

        {order.payments.length > 0 ? (
          <section aria-labelledby="payments-heading" className="flex flex-col gap-3">
            <h2 id="payments-heading" className="text-base font-semibold">
              {order.payments.length === 1 ? "Payment" : "Payments"}
            </h2>
            <ul className="flex flex-col gap-3">
              {order.payments.map((payment, index) => (
                <li key={`${payment.method}-${index}`} className="flex flex-col gap-1.5 text-sm">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-ink">{METHOD_LABEL[payment.method] ?? payment.method}</span>
                    <StatusBadge kind="payment" status={payment.status} />
                    {payment.paidAt ? (
                      <time className="text-graphite" dateTime={payment.paidAt.toISOString()}>
                        Paid {formatDateMedium(payment.paidAt)}
                      </time>
                    ) : null}
                  </p>
                  {payment.reference ? (
                    <p className="flex flex-wrap items-center gap-x-2 text-graphite">
                      <span>Transaction ID</span>
                      <Serial value={payment.reference} copyLabel="transaction ID" size="sm" />
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </main>
  );
}
