import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CreditCard, Hourglass } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatPrice, getPublishedCourseBySlug } from "@/lib/courses";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import {
  availableRails,
  BKASH_CURRENCY,
  STRIPE_CURRENCY,
} from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { startStripeCheckout } from "./actions";
import { BkashForm } from "./bkash-form";

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
};

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { status } = await searchParams;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();

  const user = await requireUser(`/courses/${slug}/checkout`);
  const enrolled = await isEnrolled(user.id, course.id);

  if (enrolled) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <Alert>
          <CircleCheck className="size-4 text-brand" />
          <AlertTitle>You already have access</AlertTitle>
          <AlertDescription>
            <p>{course.title} is in your library.</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={`/learn/${course.slug}` as Route}>Start learning</Link>
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
          <Hourglass className="size-4 text-brand" />
          <AlertTitle>Payment received — finalizing…</AlertTitle>
          <AlertDescription>
            Stripe confirmed the charge. Access appears the moment the webhook lands — usually a
            few seconds.{" "}
            <Link href={`/dashboard` as Route} className="font-semibold text-brand underline">
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

  const stripeAvailable = rails.some((rail) => rail.id === "stripe") && Boolean(usdPrice);
  const bkashAvailable = rails.some((rail) => rail.id === "bkash-manual") && Boolean(bdtPrice);

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Checkout</h1>
      <p className="mt-1 text-muted-foreground">{course.title}</p>

      {status === "cancelled" ? (
        <Alert className="mt-6" role="status">
          <AlertTitle>Payment cancelled</AlertTitle>
          <AlertDescription>No charge was made. Pick a payment method below to try again.</AlertDescription>
        </Alert>
      ) : null}

      {status === "error" ? (
        <Alert className="mt-6" variant="destructive" role="alert">
          <AlertTitle>Could not start checkout</AlertTitle>
          <AlertDescription>Card payments aren&rsquo;t available right now. Try bKash, or come back later.</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 flex flex-col gap-6">
        {pending ? (
          <Alert role="status">
            <Hourglass className="size-4 text-brand" />
            <AlertTitle>Awaiting verification</AlertTitle>
            <AlertDescription>
              You submitted transaction <strong>{pending.bkashTransactionId}</strong> on{" "}
              {pending.createdAt.toLocaleDateString("en-GB")}. An admin will confirm it shortly —
              you&rsquo;ll get access as soon as it&rsquo;s approved.
            </AlertDescription>
          </Alert>
        ) : null}

        {!pending && stripeAvailable ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-5 text-brand" aria-hidden />
                Pay with card
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Amount:{" "}
                <strong className="text-lg text-brand">
                  {formatPrice(usdPrice!.amount, usdPrice!.currency)}
                </strong>
              </p>
            </CardHeader>
            <CardContent>
              <form action={startStripeCheckout}>
                <input type="hidden" name="courseId" value={course.id} />
                <Button type="submit" size="lg" className="w-full shadow-brand">
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

        {!pending && bkashAvailable ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Pay with bKash</CardTitle>
              <p className="text-sm text-muted-foreground">
                Amount to send:{" "}
                <strong className="text-lg text-brand">
                  {formatPrice(bdtPrice!.amount, bdtPrice!.currency)}
                </strong>
              </p>
            </CardHeader>
            <CardContent>
              <BkashForm courseId={course.id} />
            </CardContent>
          </Card>
        ) : null}

        {!pending && !stripeAvailable && !bkashAvailable ? (
          <Alert>
            <AlertTitle>No payment methods available</AlertTitle>
            <AlertDescription>
              This course needs a USD price for card payments and/or a BDT price for bKash. Ask an
              instructor to set one in Studio.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </main>
  );
}
