import { formatPrice } from "@/lib/courses";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { notify } from "@/lib/notifications";
import { getSite } from "@/lib/site";

/**
 * Email + in-app receipt after a bKash payment is approved.
 *
 * Called after the approval transaction commits. A failed send must not undo
 * the enrollment — the learner already has access; they can open /orders.
 */
export async function sendPaymentReceipt(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      total: true,
      currency: true,
      user: { select: { id: true, email: true, name: true } },
      items: { select: { course: { select: { title: true, slug: true } } } },
      payments: {
        where: { status: "COMPLETED" },
        orderBy: { paidAt: "desc" },
        take: 1,
        select: { bkashTransactionId: true, method: true },
      },
    },
  });

  if (!order) return;

  const titles = order.items.map((item) => item.course.title);
  const heading = titles.length === 1 ? titles[0] : `${titles.length} courses`;
  const base = getSite().url;
  const txn = order.payments[0]?.bkashTransactionId;

  await notify(order.user.id, "payment", {
    title: "Payment confirmed",
    body: heading ?? "Your purchase",
    href: `/orders/${order.id}`,
  });

  try {
    await sendEmail({
      to: order.user.email,
      subject: `Receipt for ${heading}`,
      text: [
        `Hi ${order.user.name},`,
        "",
        `We've confirmed your payment of ${formatPrice(order.total, order.currency)} for:`,
        ...titles.map((title) => `• ${title}`),
        txn ? `\nTransaction ID: ${txn}` : "",
        "",
        "You now have lifetime access. Open My Learning to start.",
      ].join("\n"),
      actionUrl: `${base}/orders/${order.id}`,
      actionLabel: "View receipt",
    });
  } catch (error) {
    console.error("Payment receipt email failed:", error);
  }
}
