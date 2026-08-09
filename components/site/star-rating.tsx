import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5];

/**
 * Read-only star display. The interactive input lives in the review form,
 * because it is the only part of the review section that needs client JS.
 *
 * The glyphs are aria-hidden and the label carries the number: five separate
 * "star" announcements tell a screen reader nothing a "4.3 out of 5" does not.
 */
export function StarRating({
  value,
  className,
  starClassName,
}: {
  value: number;
  className?: string;
  starClassName?: string;
}) {
  const filled = Math.round(value);

  return (
    <span
      className={cn("flex items-center gap-0.5 text-amber-600", className)}
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      {STARS.map((star) => (
        <Star
          key={star}
          aria-hidden
          className={cn(
            "size-4",
            starClassName,
            star <= filled ? "fill-current" : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
