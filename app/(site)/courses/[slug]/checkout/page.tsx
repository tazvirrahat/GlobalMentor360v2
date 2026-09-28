import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard, Hourglass } from "lucide-react";
import { Price } from "@/components/course/price";
import { Serial } from "@/components/course/serial";
import { BkashCheckout } from "@/components/checkout/bkash-checkout";
import { BkashReview } from "@/components/checkout/bkash-quote";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  applyCouponQueryResult,
  bkashAmountDue,
  quoteBkashCourses,
  quotedBkashCouponCode,
} from "@/lib/checkout";
import { getPublishedCourseBySlug } from "@/lib/courses";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import { formatDate, formatPrice } from "@/lib/format";
import { availableRails, BKASH_CURRENCY, getBkashMerchantNumber, STRIPE_CURRENCY } from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { siteToday } from "@/lib/site";
import { startStripeCheckout, submitBkashPayment } from "./actions";
import { getViewerTimeZone } from "@/lib/viewer-time";

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; coupon?: string }>;
};

export const metadata = { title: "Checkout" };

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{title}</h1>
        {subtitle ? <p className="text-lg text-graphite">{subtitle}</p> : null}
      </div>
      {children}
    </main>
  );
}

/**
 * Buying one course (spec §6): the bKash sequence (review, pay, submit the
 * transaction ID) and, when card payments are configured and the course has a
 * USD price, Stripe as a second option. The learner's name and email are never
 * asked for: they are known (WCAG 3.3.7).
 */
export default async function CheckoutPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { status, coupon: couponParam } = await searchParams;
  const appliedCoupon = couponParam?.trim() || undefined;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();

  const user = await requireUser(`/courses/${slug}/checkout`);
  const timeZone = await getViewerTimeZone();

  if (await isEnrolled(user.id, course.id)) {
    return (
      <Shell title="You already have this course" subtitle={course.title}>
        <div>
          <Button asChild size="lg">
            <Link href={`/learn/${course.slug}` as Route}>Go to course</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (status === "success") {
    return (
      <Shell title="Payment received" subtitle={course.title}>
        <Alert role="status" variant="caution">
          <Hourglass className="size-4" />
          <AlertTitle>Opening your course</AlertTitle>
          <AlertDescription>
            <p>
              Stripe confirmed the payment. The course opens as soon as the confirmation reaches us, usually within a
              few seconds.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-2">
              <Link href="/dashboard">Go to My learning</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </Shell>
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

  const rails = availableRails();
  const stripeConfigured = rails.some((rail) => rail.id === "stripe");
  const [usdPrice, bdtPrice] = await Promise.all([
    db.price.findFirst({
      where: { courseId: course.id, currency: STRIPE_CURRENCY, isActive: true },
      select: { amount: true, currency: true },
    }),
    db.price.findFirst({
      where: { courseId: course.id, currency: BKASH_CURRENCY, isActive: true },
      select: { amount: true, currency: true },
    }),
  ]);

  const stripeAvailable = stripeConfigured && Boolean(usdPrice);
  const bkashAvailable = rails.some((rail) => rail.id === "bkash-manual") && Boolean(bdtPrice);

  let quote = !pending && bkashAvailable ? await quoteBkashCourses(user.id, [course.id], appliedCoupon) : null;
  let couponMessage: string | null = null;
  if (quote) {
    const fallback = applyCouponQueryResult(quote, appliedCoupon);
    couponMessage = fallback.couponMessage;
    if (fallback.retryWithoutCoupon) {
      quote = await quoteBkashCourses(user.id, [course.id]);
    }
  }

  return (
    <Shell title="Checkout" subtitle={course.title}>
      {status === "cancelled" ? (
        <Alert role="status">
          <AlertTitle>Card payment cancelled</AlertTitle>
          <AlertDescription>No money was taken. Choose a way to pay below to try again.</AlertDescription>
        </Alert>
      ) : null}
      {status === "in-flight" ? (
        <Alert role="status" variant="caution">
          <Hourglass className="size-4" />
          <AlertTitle>A payment is already being checked</AlertTitle>
          <AlertDescription>You have a bKash payment for this course awaiting verification.</AlertDescription>
        </Alert>
      ) : null}
      {status === "unavailable" ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Card payments are not available right now</AlertTitle>
          <AlertDescription>Pay with bKash below, or try the card again later.</AlertDescription>
        </Alert>
      ) : null}
      {status === "error" ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not start the card payment</AlertTitle>
          <AlertDescription>Something went wrong before Stripe opened. Try again, or pay with bKash.</AlertDescription>
        </Alert>
      ) : null}

      {pending ? (
        <Alert variant="caution">
          <Hourglass className="size-4" />
          <AlertTitle>Awaiting verification</AlertTitle>
          <AlertDescription>
            <p className="flex flex-wrap items-center gap-x-1.5">
              You submitted transaction
              {pending.bkashTransactionId ? <Serial value={pending.bkashTransactionId} size="sm" /> : null}
              on {formatDate(pending.createdAt, timeZone)}.
            </p>
            <p>The course opens as soon as the payment is confirmed. You will get a notification.</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {!pending && bkashAvailable && quote && !quote.ok ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not price this course</AlertTitle>
          <AlertDescription>{quote.message}</AlertDescription>
        </Alert>
      ) : null}

      {!pending && bkashAvailable && quote?.ok ? (
        <BkashCheckout
          action={submitBkashPayment}
          review={
            <BkashReview
              quote={quote}
              appliedCoupon={appliedCoupon}
              couponAction={`/courses/${course.slug}/checkout` as Route}
              couponMessage={couponMessage}
            />
          }
          amount={<Price amount={bkashAmountDue(quote)} currency={BKASH_CURRENCY} />}
          amountText={formatPrice(bkashAmountDue(quote), BKASH_CURRENCY)}
          merchantNumber={getBkashMerchantNumber()}
          today={siteToday()}
          zeroTotal={bkashAmountDue(quote) === 0}
          hiddenFields={
            <>
              <input type="hidden" name="courseId" value={course.id} />
              {quotedBkashCouponCode(quote) ? (
                <input type="hidden" name="couponCode" value={quotedBkashCouponCode(quote)} />
              ) : null}
            </>
          }
        />
      ) : null}

      {!pending && stripeAvailable ? (
        <section aria-labelledby="card-heading" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5">
          <h2 id="card-heading" className="flex items-center gap-2 text-xl font-semibold">
            <CreditCard className="size-5" strokeWidth={1.75} aria-hidden />
            {bkashAvailable ? "Or pay by card" : "Pay by card"}
          </h2>
          <p className="text-graphite">
            <Price amount={usdPrice!.amount} currency={usdPrice!.currency} className="font-semibold text-ink" /> on
            Stripe&rsquo;s secure page. The course opens as soon as the payment goes through.
          </p>
          <form action={startStripeCheckout}>
            <input type="hidden" name="courseId" value={course.id} />
            <Button type="submit" size="lg" variant={bkashAvailable ? "secondary" : "default"}>
              Continue to Stripe
            </Button>
          </form>
        </section>
      ) : null}

      {!pending && !stripeAvailable && !bkashAvailable ? (
        <Alert>
          <AlertTitle>No payment methods available</AlertTitle>
          <AlertDescription>
            {/* Only name a fix that would actually work: a USD price does
                nothing while the card rail is unconfigured. */}
            {stripeConfigured
              ? "This course needs a USD price for card payments or a BDT price for bKash, so it cannot be bought yet."
              : "This course has no BDT price, so it cannot be bought with bKash, the only payment method right now."}
          </AlertDescription>
        </Alert>
      ) : null}
    </Shell>
  );
}
