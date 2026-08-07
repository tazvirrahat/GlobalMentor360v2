import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/courses";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Payment verification" };

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
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Payment verification</h1>
        <Badge variant={pending.length > 0 ? "default" : "secondary"}>
          {pending.length} awaiting
        </Badge>
      </div>

      {pending.length === 0 ? (
        <p className="mt-8 text-muted-foreground">Nothing to review.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-6">
          {pending.map((payment) => (
            <li key={payment.id}>
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>
                    {payment.order.items.map((item) => item.course.title).join(", ")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Learner</dt>
                      <dd className="font-medium">{payment.user.name}</dd>
                      <dd className="text-xs text-muted-foreground">{payment.user.email}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd className="font-bold text-brand">
                        {formatPrice(payment.amount, payment.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Transaction ID</dt>
                      <dd className="font-mono font-medium">{payment.bkashTransactionId}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">bKash number</dt>
                      <dd className="font-mono">{payment.bkashPhoneNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Payment date</dt>
                      <dd>{payment.bkashPaymentDate?.toLocaleDateString("en-GB") ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Reference</dt>
                      <dd>{payment.bkashReference ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Submitted</dt>
                      <dd>{payment.createdAt.toLocaleString("en-GB")}</dd>
                    </div>
                  </dl>

                  <ReviewForm paymentId={payment.id} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
