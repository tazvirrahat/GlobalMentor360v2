import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Hourglass } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, getPublishedCourseBySlug } from "@/lib/courses";
import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";
import { BKASH_CURRENCY } from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { BkashForm } from "./bkash-form";

type Params = { params: Promise<{ slug: string }> };

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ params }: Params) {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();

  const user = await requireUser(`/courses/${slug}/checkout`);

  if (await isEnrolled(user.id, course.id)) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <Alert>
          <CircleCheck className="size-4 text-brand" />
          <AlertTitle>You already have access</AlertTitle>
          <AlertDescription>
            <p>{course.title} is in your library.</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={`/courses/${course.slug}`}>Back to the course</Link>
            </Button>
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

  // The bKash rail charges the BDT price, so that is the figure to show here.
  // Showing the USD price next to a BDT payment form invites the learner to send
  // the wrong amount.
  const bdtPrice = await db.price.findFirst({
    where: { courseId: course.id, currency: BKASH_CURRENCY, isActive: true },
    select: { amount: true, currency: true },
  });

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Checkout</h1>
      <p className="mt-1 text-muted-foreground">{course.title}</p>

      <div className="mt-8">
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
        ) : bdtPrice ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Pay with bKash</CardTitle>
              <p className="text-sm text-muted-foreground">
                Amount to send:{" "}
                <strong className="text-lg text-brand">
                  {formatPrice(bdtPrice.amount, bdtPrice.currency)}
                </strong>
              </p>
            </CardHeader>
            <CardContent>
              <BkashForm courseId={course.id} />
            </CardContent>
          </Card>
        ) : (
          <Alert>
            <AlertTitle>bKash isn&rsquo;t available for this course yet</AlertTitle>
            <AlertDescription>It has no BDT price.</AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  );
}
