import { Star } from "lucide-react";
import type { RatingBar } from "@/lib/reviews";

/**
 * The 5/4/3/2/1 breakdown (FEATURES.md section F, P0).
 *
 * The percentages arrive already computed by `summariseRatings`, so an empty
 * course renders five zero-width bars rather than dividing by no reviews here.
 */
export function RatingHistogram({ distribution }: { distribution: RatingBar[] }) {
  return (
    <ul className="flex w-full flex-col gap-1.5">
      {distribution.map((bar) => (
        <li key={bar.rating} className="flex items-center gap-3 text-sm">
          <span className="flex w-12 shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
            {bar.rating}
            <Star className="size-3.5 fill-current text-amber-600" aria-hidden />
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-amber-600"
              style={{ width: `${bar.percent}%` }}
            />
          </span>
          <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {bar.count} ({bar.percent}%)
          </span>
        </li>
      ))}
    </ul>
  );
}
