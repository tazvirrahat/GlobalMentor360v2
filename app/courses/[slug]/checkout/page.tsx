import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice, getPublishedCourseBySlug } from "@/lib/courses";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import { BKASH_CURRENCY } from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { BkashForm } from "./bkash-form";

type Params = { params: Promise<{ slug: string }> };

export const metadata = { title: "Checkout — GlobalMentor360" };

export default async function CheckoutPage({ params }: Params) {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();

  const user = await requireUser(`/courses/${slug}/checkout`);

  if (await isEnrolled(user.id, course.id)) {
    return (
      <main>
        <h1>{course.title}</h1>
        <p>You already have access to this course.</p>
        <Link href={`/courses/${course.slug}`}>Back to the course</Link>
      </main>
    );
  }

  const pending = await db.payment.findFirst({
    where: {
      userId: user.id,
      status: "PENDING_VERIFICATION",
      order: { items: { some: { courseId: course.id } } },
    },
    select: { bkashTransactionId: true, createdAt: true },
  });

  // The bKash rail charges the BDT price, so that is the figure to show here.
  // Showing the USD price next to a BDT payment form invites the learner to send
  // the wrong amount.
  const bdtPrice = await db.price.findFirst({
    where: { courseId: course.id, currency: BKASH_CURRENCY, isActive: true },
    select: { amount: true, currency: true },
  });

  return (
    <main>
      <h1>Checkout</h1>
      <h2>{course.title}</h2>

      {pending ? (
        <div role="status">
          <h3>Awaiting verification</h3>
          <p>
            You submitted transaction <strong>{pending.bkashTransactionId}</strong> on{" "}
            {pending.createdAt.toLocaleDateString("en-GB")}. An admin will confirm it shortly.
          </p>
        </div>
      ) : bdtPrice ? (
        <>
          <h3>Pay with bKash</h3>
          <p>
            Amount to send: <strong>{formatPrice(bdtPrice.amount, bdtPrice.currency)}</strong>
          </p>
          <BkashForm courseId={course.id} />
        </>
      ) : (
        <p>bKash isn&rsquo;t available for this course yet — it has no BDT price.</p>
      )}
    </main>
  );
}
