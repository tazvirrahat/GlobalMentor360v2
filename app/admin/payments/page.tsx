import { Banknote } from "lucide-react";
import { PageNav } from "@/components/site/page-nav";
import { EmptyState } from "@/components/site/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import { parsePage, showingRange } from "@/lib/pagination";
import { listPendingManualPayments, MANUAL_PAYMENT_QUEUE_PAGE_SIZE } from "@/lib/payments";
import { requireRole } from "@/lib/session";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Payments | Admin" };

// The queue must reflect reality the moment an admin acts on it.
export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // Redirects non-admins. bKash approval is the one action that turns money into
  // access, so it is admin-only.
  await requireRole("ADMIN");

  const { page: pageParam } = await searchParams;
  const { items: pending, total, page, pageCount } = await listPendingManualPayments(
    parsePage(pageParam),
  );
  const range = showingRange(page, MANUAL_PAYMENT_QUEUE_PAGE_SIZE, total);

  const pager = (
    <>
      {total > 0 ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          Showing {range.from}–{range.to} of {total}
        </p>
      ) : null}
      <PageNav pathname="/admin/payments" page={page} pageCount={pageCount} />
    </>
  );

  return (
    <main className="mx-auto w-full min-w-0 max-w-[90rem] px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Payment verification</h1>
        <Badge variant={total > 0 ? "warning" : "secondary"}>{total} awaiting</Badge>
      </div>

      {total === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<Banknote className="size-6" />}
          title="Nothing to review"
          message="bKash payment proofs appear here when learners submit them."
        />
      ) : (
        <div className="mt-4 min-w-0 space-y-2">
          {pager}
          <div className="w-0 min-w-full overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b bg-muted/40 text-left text-sm font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Learner</th>
                  <th className="px-3 py-2 font-medium">Course</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Trx ID</th>
                  <th className="px-3 py-2 font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((payment) => {
                  const courses = payment.order.items.map((item) => item.course.title).join(", ");
                  const date = payment.bkashPaymentDate ?? payment.createdAt;
                  return (
                    <tr key={payment.id} className="border-b last:border-b-0 hover:bg-muted/50">
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">
                        {formatDate(date)}
                      </td>
                      <td className="max-w-[11rem] px-3 py-1.5">
                        <p
                          className="truncate"
                          title={`${payment.user.name} · ${payment.user.email}`}
                        >
                          <span className="font-medium">{payment.user.name}</span>
                          <span className="text-muted-foreground"> · {payment.user.email}</span>
                        </p>
                      </td>
                      <td className="relative max-w-[12rem] px-3 py-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="min-w-0 truncate" title={courses}>
                            {courses}
                          </p>
                          <details className="shrink-0">
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                              Proof details
                            </summary>
                            <dl className="absolute z-10 mt-1 w-56 space-y-1 rounded-md border bg-card p-2 text-xs shadow-sm">
                              <div>
                                <dt className="text-muted-foreground">bKash number</dt>
                                <dd className="font-mono tabular-nums">{payment.bkashPhoneNumber}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Reference</dt>
                                <dd>{payment.bkashReference ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Submitted</dt>
                                <dd className="tabular-nums">{formatDateTime(payment.createdAt)}</dd>
                              </div>
                            </dl>
                          </details>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums">
                        {formatPrice(payment.amount, payment.currency)}
                      </td>
                      <td
                        className="max-w-[8rem] truncate px-3 py-1.5 font-mono text-xs"
                        title={payment.bkashTransactionId ?? undefined}
                      >
                        {payment.bkashTransactionId}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <ReviewForm paymentId={payment.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pager}
        </div>
      )}
    </main>
  );
}
