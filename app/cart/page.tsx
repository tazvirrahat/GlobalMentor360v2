import type { Route } from "next";
import Link from "next/link";
import { ShoppingBag, Trash2 } from "lucide-react";
import { BkashProofForm } from "@/components/checkout/bkash-proof-form";
import { BkashQuoteCard } from "@/components/checkout/bkash-quote";
import { EmptyState } from "@/components/site/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/courses";
import { getCart, partitionCheckoutLines } from "@/lib/cart";
import { bkashAmountDue, quoteBkashCourses, quotedBkashCouponCode } from "@/lib/checkout";
import { BKASH_CURRENCY, getBkashMerchantNumber } from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { removeCourseFromCart, submitCartBkash } from "./actions";
import { EnrollFreeCartButton } from "./cart-forms";

export const metadata = { title: "Cart" };
export const dynamic = "force-dynamic";

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ coupon?: string }>;
}) {
  const user = await requireUser("/cart");
  const { coupon: couponParam } = await searchParams;
  const appliedCoupon = couponParam?.trim() || undefined;
  const cart = await getCart(user.id);
  const items = cart?.items ?? [];
  const { owned, free, payable, unpriced } = partitionCheckoutLines(items);

  let quote =
    payable.length > 0
      ? await quoteBkashCourses(
          user.id,
          payable.map((line) => line.courseId),
          appliedCoupon,
        )
      : null;
  let couponMessage: string | null = null;
  if (quote && !quote.ok && appliedCoupon) {
    couponMessage = quote.message;
    quote = await quoteBkashCourses(
      user.id,
      payable.map((line) => line.courseId),
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Cart</h1>
      <p className="mt-1 text-muted-foreground">
        {items.length === 0
          ? "Your cart is empty."
          : `${items.length} ${items.length === 1 ? "course" : "courses"}`}
      </p>

      {items.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<ShoppingBag className="size-8 text-muted-foreground" aria-hidden />}
        >
          <Button asChild className="shadow-brand">
            <Link href="/courses">Browse courses</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.courseId}>
              <Card className="rounded-2xl">
                <CardContent className="flex flex-wrap items-center gap-3 p-5">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/courses/${item.slug}` as Route}
                      className="font-semibold hover:text-brand"
                    >
                      {item.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {item.enrolled
                        ? "Already in your library"
                        : item.isFree
                          ? "Free"
                          : item.prices.find((price) => price.currency === BKASH_CURRENCY)
                            ? formatPrice(
                                item.prices.find((price) => price.currency === BKASH_CURRENCY)!
                                  .amount,
                                BKASH_CURRENCY,
                              )
                            : "No bKash price"}
                    </p>
                  </div>
                  <form action={removeCourseFromCart}>
                    <input type="hidden" name="courseId" value={item.courseId} />
                    <Button type="submit" variant="ghost" size="sm">
                      <Trash2 className="size-4" aria-hidden /> Remove
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {owned.length > 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Remove courses you already own before checkout — they will not be charged.
        </p>
      ) : null}

      {unpriced.length > 0 ? (
        <p className="mt-4 text-sm text-destructive">
          {unpriced.map((item) => item.title).join(", ")}{" "}
          {unpriced.length === 1 ? "has" : "have"} no bKash price, so{" "}
          {unpriced.length === 1 ? "it" : "they"} cannot be checked out until an instructor sets
          one.
        </p>
      ) : null}

      {free.length > 0 ? (
        <div className="mt-6">
          <EnrollFreeCartButton />
        </div>
      ) : null}

      {payable.length > 0 && quote && !quote.ok ? (
        <p className="mt-8 text-sm text-destructive" role="alert">
          {quote.message}
        </p>
      ) : null}

      {payable.length > 0 && quote?.ok ? (
        <BkashQuoteCard
          className="mt-8"
          title="Checkout with bKash"
          quote={quote}
          appliedCoupon={appliedCoupon}
          couponAction={"/cart" as Route}
          couponFieldsClassName="flex min-w-0 flex-col gap-2 sm:flex-row"
          couponMessage={couponMessage}
        >
          <BkashProofForm
            action={submitCartBkash}
            hiddenFields={
              quotedBkashCouponCode(quote) ? (
                <input type="hidden" name="couponCode" value={quotedBkashCouponCode(quote)} />
              ) : null
            }
            amountLabel={formatPrice(bkashAmountDue(quote), BKASH_CURRENCY)}
            merchantNumber={getBkashMerchantNumber()}
            successDescription={
              <>
                Your payment is awaiting verification. An admin will confirm it, usually within a few
                hours. Access unlocks as soon as it&rsquo;s approved.
              </>
            }
          />
        </BkashQuoteCard>
      ) : null}
    </main>
  );
}
