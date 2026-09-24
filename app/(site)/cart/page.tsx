import type { Route } from "next";
import Link from "next/link";
import { CoverMark } from "@/components/course/cover-mark";
import { Price } from "@/components/course/price";
import { BkashCheckout } from "@/components/checkout/bkash-checkout";
import { BkashReview } from "@/components/checkout/bkash-quote";
import { Button } from "@/components/ui/button";
import { getCart, partitionCheckoutLines } from "@/lib/cart";
import { bkashAmountDue, quoteBkashCourses, quotedBkashCouponCode } from "@/lib/checkout";
import { formatPrice } from "@/lib/format";
import { BKASH_CURRENCY, getBkashMerchantNumber } from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { siteToday } from "@/lib/site";
import { removeCourseFromCart, submitCartBkash } from "./actions";
import { EnrollFreeCartButton } from "./cart-forms";

export const metadata = { title: "Cart" };
export const dynamic = "force-dynamic";

/**
 * The cart: the courses, what each costs, and one bKash checkout for all of
 * them. Courses already owned or without a bKash price are called out rather
 * than silently dropped.
 */
export default async function CartPage({ searchParams }: { searchParams: Promise<{ coupon?: string }> }) {
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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Cart</h1>
        {items.length > 0 ? (
          <p className="text-lg text-graphite">
            {items.length} {items.length === 1 ? "course" : "courses"}
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-6">
          <h2 className="text-lg font-semibold">Your cart is empty.</h2>
          <p className="text-graphite">Add a course from its page when you are ready to buy it.</p>
          <Button asChild>
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {items.map((item) => {
              const bdt = item.prices.find((price) => price.currency === BKASH_CURRENCY);
              return (
                <li key={item.courseId} className="flex items-center gap-4 py-4">
                  <CoverMark title={item.title} slug={item.slug} size={40} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={`/courses/${item.slug}` as Route}
                      className="w-fit rounded-sm font-semibold text-ink hover:underline focus-ring"
                    >
                      {item.title}
                    </Link>
                    <span className="text-sm text-graphite">
                      {item.enrolled ? (
                        "Already in your courses"
                      ) : item.isFree ? (
                        "Free"
                      ) : bdt ? (
                        <Price amount={bdt.amount} currency={BKASH_CURRENCY} className="text-ink" />
                      ) : (
                        "Not sold in taka"
                      )}
                    </span>
                  </div>
                  <form action={removeCourseFromCart}>
                    <input type="hidden" name="courseId" value={item.courseId} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${item.title} from cart`}>
                      Remove
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>

          {owned.length > 0 ? (
            <p className="text-sm text-graphite">
              You already have {owned.length === 1 ? "one of these courses" : "some of these courses"}. Remove{" "}
              {owned.length === 1 ? "it" : "them"} before paying; {owned.length === 1 ? "it is" : "they are"} not
              charged.
            </p>
          ) : null}

          {unpriced.length > 0 ? (
            <p className="text-sm font-medium text-seal">
              {new Intl.ListFormat("en").format(unpriced.map((item) => item.title))}{" "}
              {unpriced.length === 1 ? "has" : "have"} no price in taka, so {unpriced.length === 1 ? "it" : "they"}{" "}
              cannot be paid for with bKash yet.
            </p>
          ) : null}

          {free.length > 0 ? <EnrollFreeCartButton /> : null}

          {payable.length > 0 && quote && !quote.ok ? (
            <p className="text-sm font-medium text-seal" role="alert">
              {quote.message}
            </p>
          ) : null}

          {payable.length > 0 && quote?.ok ? (
            <BkashCheckout
              action={submitCartBkash}
              review={
                <BkashReview
                  quote={quote}
                  appliedCoupon={appliedCoupon}
                  couponAction={"/cart" as Route}
                  couponMessage={couponMessage}
                />
              }
              amount={<Price amount={bkashAmountDue(quote)} currency={BKASH_CURRENCY} />}
              amountText={formatPrice(bkashAmountDue(quote), BKASH_CURRENCY)}
              merchantNumber={getBkashMerchantNumber()}
              today={siteToday()}
              zeroTotal={bkashAmountDue(quote) === 0}
              hiddenFields={
                quotedBkashCouponCode(quote) ? (
                  <input type="hidden" name="couponCode" value={quotedBkashCouponCode(quote)} />
                ) : null
              }
            />
          ) : null}
        </>
      )}
    </main>
  );
}
