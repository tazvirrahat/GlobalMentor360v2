import { Star } from "lucide-react";
import type { RatingBar } from "@/lib/reviews";

/**
 * The 5/4/3/2/1 breakdown (FEATURES.md section F, P0).
 *
 * The percentages arrive already computed by `summariseRatings`, so an empty
 * course renders five zero-width bars rather than dividing by no reviews here.
 *
 * The sr-only spans carry the units. Every unit in a row is drawn rather than
 * written — the star glyph, the bar, the bracket — so the visible text alone
 * announced as "5 20 (20%)", three numbers with nothing to say which is a star
 * value and which is a tally. Sighted readers get the same information from the
 * glyph, so this adds no visible text (WCAG 2.1 AA, FEATURES.md section O).
 */
export function RatingHistogram({ distribution }: { distribution: RatingBar[] }) {
  return (
    <ul className="flex w-full flex-col gap-1.5">
      {distribution.map((bar) => (
        <li key={bar.rating} className="flex items-center gap-3 text-sm">
          <span className="flex w-12 shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
            {bar.rating}
            <span className="sr-only">{bar.rating === 1 ? " star" : " stars"}</span>
            <Star className="size-3.5 fill-current text-amber-600" aria-hidden />
          </span>
          {/* No text and no role: the bar is a redrawing of the percentage
              already announced at the end of the row, not a second fact. */}
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className="block h-full rounded-full bg-amber-600"
              style={{ width: `${bar.percent}%` }}
            />
          </span>
          <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {bar.count}
            <span className="sr-only">{bar.count === 1 ? " review" : " reviews"}</span> (
            {bar.percent}%)
          </span>
        </li>
      ))}
    </ul>
  );
}
