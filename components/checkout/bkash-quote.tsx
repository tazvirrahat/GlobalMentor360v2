import type { Route } from "next";
import { Price } from "@/components/course/price";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bkashAmountDue, type CheckoutQuote } from "@/lib/checkout";
import { BKASH_CURRENCY } from "@/lib/payments";

type OkQuote = Extract<CheckoutQuote, { ok: true }>;

/** A label/amount row of the order summary. */
function Row({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 text-base font-semibold" : "flex justify-between gap-4"}>
      <dt className={strong ? "text-ink" : "text-graphite"}>{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

/**
 * Step 1 of a bKash checkout: what is being bought, a coupon, and the total.
 * The coupon is a plain GET back to the same page (`?coupon=`); the server
 * re-quotes, so a price is never taken from the form.
 */
export function BkashReview({
  quote,
  appliedCoupon,
  couponAction,
  couponMessage,
}: {
  quote: OkQuote;
  appliedCoupon?: string;
  couponAction: Route;
  couponMessage: string | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {quote.lines.map((line) => (
          <li key={line.courseId} className="flex items-start justify-between gap-4 py-3">
            <span className="min-w-0 font-medium text-ink">{line.title}</span>
            <Price amount={line.unitPrice} currency={BKASH_CURRENCY} className="shrink-0" />
          </li>
        ))}
      </ul>

      <form action={couponAction} className="flex flex-col gap-1.5">
        <Label htmlFor="coupon">Coupon code</Label>
        <div className="flex gap-2">
          <Input
            id="coupon"
            name="coupon"
            defaultValue={quote.coupon?.code ?? appliedCoupon ?? ""}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase sm:max-w-60"
            aria-invalid={couponMessage ? true : undefined}
            aria-describedby={couponMessage ? "coupon-hint coupon-error" : "coupon-hint"}
          />
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </div>
        <p id="coupon-hint" className="text-sm text-graphite">
          Optional. The total below updates before you send any money.
        </p>
        {couponMessage ? (
          <p id="coupon-error" role="alert" className="text-sm font-medium text-seal">
            {couponMessage}
          </p>
        ) : null}
      </form>

      <dl className="flex flex-col gap-1.5 text-sm">
        <Row label="Subtotal">
          <Price amount={quote.subtotal} currency={BKASH_CURRENCY} />
        </Row>
        {quote.discount > 0 ? (
          <Row label={quote.coupon ? `Discount (${quote.coupon.code})` : "Discount"}>
            −<Price amount={quote.discount} currency={BKASH_CURRENCY} />
          </Row>
        ) : null}
        <Row label="Total" strong>
          <Price amount={bkashAmountDue(quote)} currency={BKASH_CURRENCY} />
        </Row>
      </dl>
    </div>
  );
}
