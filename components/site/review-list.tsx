import type { CourseReview } from "@/lib/reviews";
import { StarRating } from "@/components/site/star-rating";
import { formatDateMedium } from "@/lib/format";

function authorInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0] ?? "").join("").toUpperCase() || "?";
}

export function ReviewList({ reviews }: { reviews: CourseReview[] }) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-graphite">
        No written reviews yet. Enrolled learners can be the first.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-rule">
      {reviews.map((review) => (
        <li key={review.id} className="flex flex-col gap-2 py-4 first:pt-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className="flex size-8 items-center justify-center rounded-full bg-wash text-xs font-semibold text-ink"
              aria-hidden
            >
              {authorInitials(review.authorName)}
            </span>
            <StarRating value={review.rating} starClassName="size-3.5" />
            <span className="text-sm font-semibold text-ink">{review.authorName}</span>
            <span className="text-sm text-graphite">
              <time dateTime={review.createdAt.toISOString()}>
                {formatDateMedium(review.createdAt)}
              </time>
              {/* An edited review carries a date that is no longer when it was
                  written, and a reader weighing recency deserves to know. */}
              {review.updatedAt.getTime() - review.createdAt.getTime() > 1000 ? " (edited)" : null}
            </span>
          </div>
          {review.body ? (
            <p className="whitespace-pre-line text-base text-ink">
              {review.body}
            </p>
          ) : null}
          {review.response ? (
            <div className="ml-4 flex flex-col gap-1 border-l-2 border-rule pl-4">
              <p className="text-sm text-graphite">
                <span className="font-semibold text-ink">Response from {review.response.responderName}</span>
                {" · "}
                <time dateTime={review.response.createdAt.toISOString()}>{formatDateMedium(review.response.createdAt)}</time>
              </p>
              <p className="whitespace-pre-line text-base text-ink">{review.response.body}</p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
