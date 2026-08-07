import { formatPrice } from "@/lib/courses";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Payment verification — GlobalMentor360" };

// The queue must reflect reality the moment an admin acts on it.
export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  // Redirects non-admins. bKash approval is the one action that turns money into
  // access, so it is admin-only.
  await requireRole("ADMIN");

  const pending = await db.payment.findMany({
    where: { status: "PENDING_VERIFICATION" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      createdAt: true,
      bkashTransactionId: true,
      bkashPhoneNumber: true,
      bkashPaymentDate: true,
      bkashReference: true,
      user: { select: { name: true, email: true } },
      order: {
        select: { items: { select: { course: { select: { title: true } } } } },
      },
    },
  });

  return (
    <main>
      <h1>Payment verification</h1>
      <p>{pending.length} awaiting verification</p>

      {pending.length === 0 ? (
        <p>Nothing to review.</p>
      ) : (
        <ul>
          {pending.map((payment) => (
            <li key={payment.id}>
              <h2>{payment.order.items.map((item) => item.course.title).join(", ")}</h2>
              <dl>
                <dt>Learner</dt>
                <dd>
                  {payment.user.name} ({payment.user.email})
                </dd>
                <dt>Amount</dt>
                <dd>{formatPrice(payment.amount, payment.currency)}</dd>
                <dt>Transaction ID</dt>
                <dd>{payment.bkashTransactionId}</dd>
                <dt>bKash number</dt>
                <dd>{payment.bkashPhoneNumber}</dd>
                <dt>Payment date</dt>
                <dd>{payment.bkashPaymentDate?.toLocaleDateString("en-GB") ?? "—"}</dd>
                <dt>Reference</dt>
                <dd>{payment.bkashReference ?? "—"}</dd>
                <dt>Submitted</dt>
                <dd>{payment.createdAt.toLocaleString("en-GB")}</dd>
              </dl>
              <ReviewForm paymentId={payment.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
