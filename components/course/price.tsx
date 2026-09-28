import { formatPriceParts } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A price in minor units, written ৳5,990 or $49. Digits are tabular so prices
 * line up in columns; the comma is not, because Schibsted Grotesk's tabular
 * comma is as wide as a digit.
 */
export function Price({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      {formatPriceParts(amount, currency).map((part, index) =>
        part.separator ? (
          <span key={index} className="[font-variant-numeric:normal]">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </span>
  );
}

/**
 * What a course costs: "Free" (every rail free), the headline price, or "Not
 * for sale" when no active price exists. isFree and price come from
 * lib/courses so the catalog, landing page and checkout agree.
 */
export function CoursePrice({
  isFree,
  price,
  className,
}: {
  isFree: boolean;
  price: { amount: number; currency: string } | null;
  className?: string;
}) {
  if (isFree) return <span className={cn("font-semibold text-verified", className)}>Free</span>;
  if (!price) return <span className={cn("text-graphite", className)}>Not for sale</span>;
  return <Price amount={price.amount} currency={price.currency} className={cn("font-semibold text-ink", className)} />;
}
