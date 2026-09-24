import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CreditCard, Hourglass } from "lucide-react";
import { BkashProofForm } from "@/components/checkout/bkash-proof-form";
import { BkashQuoteCard } from "@/components/checkout/bkash-quote";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  applyCouponQueryResult,
  bkashAmountDue,
  quoteBkashCourses,
  quotedBkashCouponCode,
} from "@/lib/checkout";
import { formatDate } from "@/lib/format";
import { formatPrice, getPublishedCourseBySlug } from "@/lib/courses";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import {
  availableRails,
  BKASH_CURRENCY,
  getBkashMerchantNumber,
  STRIPE_CURRENCY,
} from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { startStripeCheckout, submitBkashPayment } from "./actions";

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; coupon?: string }>;
};

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { status, coupon: couponParam } = await searchParams;
  const appliedCoupon = couponParam?.trim() || undefined;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();

  const user = await requireUser(`/courses/${slug}/checkout`);
  const enrolled = await isEnrolled(user.id, course.id);

  if (enrolled) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <Alert>
          <CircleCheck className="size-4 text-primary" />
          <AlertTitle>You already have access</AlertTitle>
          <AlertDescription>
            <p>{course.title} is in your library.</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={`/learn/${course.slug}` as Route} className="cursor-pointer">
                Start learning
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <Alert role="status">
          <Hourglass className="size-4 text-primary" />
          <AlertTitle>Payment received — finalizing…</AlertTitle>
          <AlertDescription>
            Stripe confirmed the charge. Access appears the moment the webhook lands — usually a
            few seconds.{" "}
            <Link href={`/dashboard` as Route} className="font-semibold text-primary underline">
              Check My Learning
            </Link>{" "}
            or refresh this page.
          </AlertDescription>
        </Alert>
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

  let quote =
    !pending && bkashAvailable
      ? await quoteBkashCourses(user.id, [course.id], appliedCoupon)
      : null;
  let couponMessage: string | null = null;
  if (quote) {
    const fallback = applyCouponQueryResult(quote, appliedCoupon);
    couponMessage = fallback.couponMessage;
    if (fallback.retryWithoutCoupon) {
      quote = await quoteBkashCourses(user.id, [course.id]);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-1 text-muted-foreground">{course.title}</p>

      {status === "cancelled" ? (
        <Alert className="mt-6" role="status">
          <AlertTitle>Payment cancelled</AlertTitle>
          <AlertDescription>No charge was made. Pick a payment method below to try again.</AlertDescription>
        </Alert>
      ) : null}

      {status === "in-flight" ? (
        <Alert className="mt-6" role="status">
          <Hourglass className="size-4 text-primary" />
          <AlertTitle>Payment already in progress</AlertTitle>
          <AlertDescription>
            You already have a payment awaiting verification for this course.
          </AlertDescription>
        </Alert>
      ) : null}

      {status === "unavailable" ? (
        <Alert className="mt-6" variant="destructive" role="alert">
          <AlertTitle>Card payments unavailable</AlertTitle>
          <AlertDescription>
            Card payments aren&rsquo;t available right now. Try bKash, or come back later.
          </AlertDescription>
        </Alert>
      ) : null}

      {status === "error" ? (
        <Alert className="mt-6" variant="destructive" role="alert">
          <AlertTitle>Could not start checkout</AlertTitle>
          <AlertDescription>
            Something went wrong starting card checkout. Try again, or pay with bKash.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {pending ? (
            <Alert role="status">
              <Hourglass className="size-4 text-primary" />
              <AlertTitle>Awaiting verification</AlertTitle>
              <AlertDescription>
                You submitted transaction <strong>{pending.bkashTransactionId}</strong> on{" "}
                {formatDate(pending.createdAt)}. An admin will confirm it shortly —
                you&rsquo;ll get access as soon as it&rsquo;s approved.
              </AlertDescription>
            </Alert>
          ) : null}

          {!pending && stripeAvailable ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="size-5 text-primary" aria-hidden />
                  Pay with card
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Amount:{" "}
                  <strong className="font-heading text-lg font-semibold tabular-nums text-primary">
                    {formatPrice(usdPrice!.amount, usdPrice!.currency)}
                  </strong>
                </p>
              </CardHeader>
              <CardContent>
                <form action={startStripeCheckout}>
                  <input type="hidden" name="courseId" value={course.id} />
                  <Button type="submit" size="lg" className="w-full">
                    Continue to Stripe
                  </Button>
                </form>
                <p className="mt-2 text-xs text-muted-foreground">
                  You&rsquo;ll be redirected to Stripe&rsquo;s secure checkout. Access unlocks the
                  moment payment is confirmed.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {!pending && stripeAvailable && bkashAvailable ? (
            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>
          ) : null}

          {!pending && bkashAvailable && quote && !quote.ok ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Could not price this course</AlertTitle>
              <AlertDescription>{quote.message}</AlertDescription>
            </Alert>
          ) : null}

          {!pending && bkashAvailable && quote?.ok ? (
            <BkashQuoteCard
              title="Pay with bKash"
              quote={quote}
              appliedCoupon={appliedCoupon}
              couponAction={`/courses/${course.slug}/checkout` as Route}
              couponFieldsClassName="flex flex-wrap gap-2"
              couponMessage={couponMessage}
            >
              <BkashProofForm
                action={submitBkashPayment}
                hiddenFields={
                  <>
                    <input type="hidden" name="courseId" value={course.id} />
                    {quotedBkashCouponCode(quote) ? (
                      <input type="hidden" name="couponCode" value={quotedBkashCouponCode(quote)} />
                    ) : null}
                  </>
                }
                amountLabel={formatPrice(bkashAmountDue(quote), BKASH_CURRENCY)}
                merchantNumber={getBkashMerchantNumber()}
                successDescription={
                  <>
                    Your payment is awaiting verification. An admin will confirm it, usually within a
                    few hours. You&rsquo;ll get access to the course as soon as it&rsquo;s approved.
                  </>
                }
              />
            </BkashQuoteCard>
          ) : null}

          {!pending && !stripeAvailable && !bkashAvailable ? (
            <Alert>
              <AlertTitle>No payment methods available</AlertTitle>
              <AlertDescription>
                {/* Only name a fix that would actually work: a USD price does
                    nothing while the card rail is unconfigured. */}
                {stripeConfigured
                  ? "This course needs a USD price for card payments and/or a BDT price for bKash. Ask an instructor to set one in Studio."
                  : "This course has no BDT price, so it can't be bought with bKash — the only payment method right now. Ask an instructor to set a BDT price in Studio."}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24">
          <Card>
            <CardHeader>
              <CardTitle>Order summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 truncate font-medium" title={course.title}>
                  {course.title}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {bdtPrice
                    ? formatPrice(bdtPrice.amount, bdtPrice.currency)
                    : usdPrice
                      ? formatPrice(usdPrice.amount, usdPrice.currency)
                      : "—"}
                </span>
              </div>
              {quote?.ok && quote.discount > 0 ? (
                <p className="text-muted-foreground">
                  Discount{quote.coupon ? ` (${quote.coupon.code})` : ""}: −
                  {formatPrice(quote.discount, BKASH_CURRENCY)}
                </p>
              ) : null}
              <Separator />
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Due</span>
                <span className="font-heading text-lg font-semibold tabular-nums text-primary">
                  {quote?.ok
                    ? formatPrice(bkashAmountDue(quote), BKASH_CURRENCY)
                    : bdtPrice
                      ? formatPrice(bdtPrice.amount, bdtPrice.currency)
                      : usdPrice
                        ? formatPrice(usdPrice.amount, usdPrice.currency)
                        : "—"}
                </span>
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
