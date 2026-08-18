import type { Route } from "next";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/site/field-error";
import { bkashAmountDue, type CheckoutQuote } from "@/lib/checkout";
import { formatPrice } from "@/lib/format";
import { BKASH_CURRENCY } from "@/lib/payments";
import { cn } from "@/lib/utils";

type OkQuote = Extract<CheckoutQuote, { ok: true }>;

export function BkashQuoteCard({
  title,
  quote,
  appliedCoupon,
  couponAction,
  couponFieldsClassName,
  couponMessage,
  className,
  children,
}: {
  title: string;
  quote: OkQuote;
  appliedCoupon?: string;
  couponAction: Route;
  couponFieldsClassName: string;
  couponMessage: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Subtotal: {formatPrice(quote.subtotal, BKASH_CURRENCY)}
        </p>
        {quote.discount > 0 ? (
          <p className="text-sm text-muted-foreground">
            Discount{quote.coupon ? ` (${quote.coupon.code})` : ""}: −
            {formatPrice(quote.discount, BKASH_CURRENCY)}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Amount to send:{" "}
          <strong className="text-lg text-brand">
            {formatPrice(bkashAmountDue(quote), BKASH_CURRENCY)}
          </strong>
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form action={couponAction} className="flex flex-col gap-2">
          <Label htmlFor="coupon">Coupon (optional)</Label>
          <div className={couponFieldsClassName}>
            <Input
              id="coupon"
              name="coupon"
              defaultValue={quote.coupon?.code ?? appliedCoupon ?? ""}
              autoComplete="off"
            />
            <Button type="submit" variant="outline">
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Apply a code to see the amount you should send. A code that covers
            the full price enrols you immediately — transfer details are not
            needed then.
          </p>
          {couponMessage ? <FieldError message={couponMessage} /> : null}
        </form>
        {children}
      </CardContent>
    </Card>
  );
}
