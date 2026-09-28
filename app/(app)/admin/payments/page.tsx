import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { Price } from "@/components/course/price";
import { Serial } from "@/components/course/serial";
import { EmptyState } from "@/components/site/empty-state";
import { Badge } from "@/components/ui/badge";
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
import { formatTimeOfDay } from "@/lib/day-groups";
import { parsePage, showingRange } from "@/lib/pagination";
import { listPendingManualPayments, MANUAL_PAYMENT_QUEUE_PAGE_SIZE } from "@/lib/payments";
import { requireRole } from "@/lib/session";
import { getSite } from "@/lib/site";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Payments | Admin" };

// The queue must reflect reality the moment an admin acts on it.
export const dynamic = "force-dynamic";

type QueueRow = Awaited<ReturnType<typeof listPendingManualPayments>>["items"][number];

/** What the learner told us about the payment: the ID to find in the bKash account, and who sent it. */
function BkashProof({ payment }: { payment: QueueRow }) {
  return (
    <dl className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-2">
        <dt className="text-graphite">Transaction ID</dt>
        <dd>
          {payment.bkashTransactionId ? (
            <Serial value={payment.bkashTransactionId} copyLabel="transaction ID" size="sm" />
          ) : (
            "Not given"
          )}
        </dd>
      </div>
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-graphite">From</dt>
        <dd className="font-mono text-ink">{payment.bkashPhoneNumber ?? "Not given"}</dd>
      </div>
      {payment.bkashPaymentDate ? (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-graphite">Paid on</dt>
          <dd className="text-ink">{formatDateMedium(payment.bkashPaymentDate)}</dd>
        </div>
      ) : null}
      {payment.bkashReference ? (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-graphite">Reference</dt>
          <dd className="break-all text-ink">{payment.bkashReference}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * bKash payments waiting for a person to match them against the bKash account
 *: oldest first, one row each, Approve or Reject.
 */
export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  // Redirects non-admins. bKash approval is the one action that turns money into
  // access, so it is admin-only.
  await requireRole("ADMIN");

  const { page: pageParam } = await searchParams;
  const { items: pending, total, page, pageCount } = await listPendingManualPayments(parsePage(pageParam));
  const range = showingRange(page, MANUAL_PAYMENT_QUEUE_PAGE_SIZE, total);
  const { timeZone } = getSite();

  return (
    <main className="flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Payment verification"
        description="Check each transaction ID against the bKash account, then approve or reject it. Oldest first."
        meta={total > 0 ? <Badge variant="warning">{total} waiting</Badge> : null}
      />

      {total === 0 ? (
        <EmptyState
          title="Nothing to review"
          message="When a learner pays with bKash and submits their transaction ID, it waits here for you."
        />
      ) : (
        <>
          <div className="hidden md:block">
          <Table className="min-w-[56rem]">
            <TableCaption>bKash payments waiting for review</TableCaption>
            <colgroup>
              <col className="w-28" />
              <col className="w-48" />
              <col />
              <col className="w-24" />
              <col className="w-60" />
              <col className="w-44" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Learner</TableHead>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>bKash</TableHead>
                <TableHead>
                  <span className="sr-only">Review</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((payment) => {
                const courses = payment.order.items.map((item) => item.course.title).join(", ");
                const summary = `${payment.user.name} paid ${formatPrice(payment.amount, payment.currency)} for ${courses || "an order"}.`;
                return (
                  <TableRow key={payment.id} className="align-top">
                    <TableCell className="align-top">
                      <time dateTime={payment.createdAt.toISOString()} className="flex flex-col">
                        <span className="text-ink">{formatDateMedium(payment.createdAt)}</span>
                        <span className="text-sm text-graphite">{formatTimeOfDay(payment.createdAt, timeZone)}</span>
                      </time>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium break-words text-ink">{payment.user.name}</span>
                        <span className="text-sm break-all text-graphite">{payment.user.email}</span>
                      </span>
                    </TableCell>
                    <TableCell className="align-top text-ink">{courses || "Order"}</TableCell>
                    <TableCell className="text-right align-top font-semibold">
                      <Price amount={payment.amount} currency={payment.currency} />
                    </TableCell>
                    <TableCell className="align-top">
                      <BkashProof payment={payment} />
                    </TableCell>
                    <TableCell className="align-top">
                      <ReviewForm paymentId={payment.id} summary={summary} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>

          {/* Phones (bKash is a phone app, so this gets used): one stacked row per payment. */}
          <ul className="flex flex-col divide-y divide-rule border-y border-rule md:hidden">
            {pending.map((payment) => {
              const courses = payment.order.items.map((item) => item.course.title).join(", ");
              const summary = `${payment.user.name} paid ${formatPrice(payment.amount, payment.currency)} for ${courses || "an order"}.`;
              return (
                <li key={payment.id} className="flex flex-col gap-3 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink">{payment.user.name}</span>
                      <span className="text-sm break-all text-graphite">{payment.user.email}</span>
                    </span>
                    <Price amount={payment.amount} currency={payment.currency} className="shrink-0 font-semibold" />
                  </div>
                  <p className="text-ink">{courses || "Order"}</p>
                  <BkashProof payment={payment} />
                  <p className="text-sm text-graphite">
                    Submitted{" "}
                    <time dateTime={payment.createdAt.toISOString()}>
                      {formatDateMedium(payment.createdAt)}, {formatTimeOfDay(payment.createdAt, timeZone)}
                    </time>
                  </p>
                  <ReviewForm paymentId={payment.id} summary={summary} align="start" />
                </li>
              );
            })}
          </ul>
          <ListFooter range={range} total={total} pathname="/admin/payments" page={page} pageCount={pageCount} />
        </>
      )}
    </main>
  );
}
