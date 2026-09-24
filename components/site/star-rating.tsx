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
      className={cn("flex items-center gap-0.5 text-star", className)}
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

/**
 * The one-glyph "4.5 (12)" summary, for places five stars do not fit: the
 * catalog card and the landing page hero, which both had their own copy of it.
 *
 * Same accessible name in both, and it says what the numbers are. The visible
 * text alone announces as "4.5 12" — a screen reader has no way to know the
 * first number is out of five and the second is a count, because the only thing
 * that distinguished them was a star glyph and a bracket.
 *
 * Callers decide what an empty course renders. There is no sensible shared
 * answer: the hero says "No ratings yet" and the card shows nothing at all.
 */
export function CompactRating({
  average,
  count,
  className,
  starClassName,
  countClassName,
  showRatingsWord = false,
}: {
  average: number;
  count: number;
  className?: string;
  starClassName?: string;
  countClassName?: string;
  /** "(12 ratings)" where there is room for it; "(12)" in the catalog grid. */
  showRatingsWord?: boolean;
}) {
  const ratings = `${count} ${count === 1 ? "rating" : "ratings"}`;

  return (
    <span
      className={cn("flex items-center gap-1 font-semibold tabular-nums text-star", className)}
      role="img"
      aria-label={`${average.toFixed(1)} out of 5 stars, ${ratings}`}
    >
      <Star className={cn("size-4 fill-current", starClassName)} aria-hidden />
      {average.toFixed(1)}
      <span className="sr-only"> out of 5 stars</span>
      <span className={cn("font-normal", countClassName)}>
        ({showRatingsWord ? ratings : count})
        {showRatingsWord ? null : (
          <span className="sr-only"> {count === 1 ? "rating" : "ratings"}</span>
        )}
      </span>
    </span>
  );
}
