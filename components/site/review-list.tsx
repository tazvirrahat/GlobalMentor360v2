import type { CourseReview } from "@/lib/reviews";
import { StarRating } from "@/components/site/star-rating";
import { formatDateMedium } from "@/lib/format";

export function ReviewList({ reviews }: { reviews: CourseReview[] }) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No written reviews yet. Enrolled learners can be the first.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y">
      {reviews.map((review) => (
        <li key={review.id} className="flex flex-col gap-2 py-4 first:pt-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StarRating value={review.rating} starClassName="size-3.5" />
            <span className="text-sm font-semibold">{review.authorName}</span>
            <span className="text-xs text-muted-foreground">
              <time dateTime={review.createdAt.toISOString()}>
                {formatDateMedium(review.createdAt)}
              </time>
              {/* An edited review carries a date that is no longer when it was
                  written, and a reader weighing recency deserves to know. */}
              {review.updatedAt.getTime() - review.createdAt.getTime() > 1000 ? " (edited)" : null}
            </span>
          </div>
          {review.body ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {review.body}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
