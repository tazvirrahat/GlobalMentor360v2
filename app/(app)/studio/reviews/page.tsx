import type { Route } from "next";
import Link from "next/link";
import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/site/empty-state";
import { StarRating } from "@/components/site/star-rating";
import { Badge } from "@/components/ui/badge";
import { formatDateMedium } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { INSTRUCTOR_REVIEW_PAGE_SIZE, listInstructorReviews } from "@/lib/reviews";
import { requireRole } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ReviewReply } from "./review-reply";
import { getViewerTimeZone } from "@/lib/viewer-time";

export const metadata = { title: "Reviews | Studio" };
export const dynamic = "force-dynamic";

type Params = { searchParams: Promise<{ unanswered?: string; page?: string }> };

/** What learners said about the instructor's courses, with a reply under each. */
export default async function StudioReviewsPage({ searchParams }: Params) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const timeZone = await getViewerTimeZone();
  const query = await searchParams;
  const unansweredOnly = query.unanswered === "1";
  const list = await listInstructorReviews(user.id, { unansweredOnly, page: query.page });
  const range = showingRange(list.page, INSTRUCTOR_REVIEW_PAGE_SIZE, list.total);

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-8 items-center rounded-md border px-3 text-sm font-medium focus-ring",
      active ? "border-ink bg-ink text-surface" : "border-control bg-surface text-ink hover:bg-wash",
    );

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Reviews"
        description={
          list.unanswered === 0
            ? "Every review has a reply from you."
            : `${list.unanswered} ${list.unanswered === 1 ? "review has" : "reviews have"} no reply yet. Replies show under the review on the course page.`
        }
      />

      <nav aria-label="Filter reviews" className="flex flex-wrap items-center gap-2">
        <Link href={"/studio/reviews" as Route} aria-current={unansweredOnly ? undefined : "page"} className={chip(!unansweredOnly)}>
          All reviews
        </Link>
        <Link
          href={"/studio/reviews?unanswered=1" as Route}
          aria-current={unansweredOnly ? "page" : undefined}
          className={chip(unansweredOnly)}
        >
          Needs a reply
        </Link>
      </nav>

      {list.items.length === 0 ? (
        unansweredOnly ? (
          <EmptyState title="Nothing waiting" message="You have replied to every review." />
        ) : (
          <EmptyState title="No reviews yet" message="When learners review your courses, the reviews appear here." />
        )
      ) : (
        <>
          <ol className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-surface">
            {list.items.map((review) => (
              <li key={review.id} className="flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StarRating value={review.rating} starClassName="size-3.5" />
                  <span className="text-sm font-semibold text-ink">{review.authorName}</span>
                  <span className="text-sm text-graphite">
                    <time dateTime={review.createdAt.toISOString()}>{formatDateMedium(review.createdAt, timeZone)}</time>
                  </span>
                  {review.response ? null : <Badge variant="warning">No reply yet</Badge>}
                </div>
                <p className="text-sm text-graphite">
                  On{" "}
                  <Link
                    href={`/courses/${review.course.slug}#reviews` as Route}
                    className="rounded-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                  >
                    {review.course.title}
                  </Link>
                </p>
                {review.body ? (
                  <p className="whitespace-pre-line text-ink">{review.body}</p>
                ) : (
                  <p className="text-sm text-graphite">A rating without a written review.</p>
                )}
                <ReviewReply
                  reviewId={review.id}
                  authorName={review.authorName}
                  reply={review.response ? { body: review.response.body, dateLabel: formatDateMedium(review.response.createdAt, timeZone) } : null}
                />
              </li>
            ))}
          </ol>
          <ListFooter
            range={range}
            total={list.total}
            pathname="/studio/reviews"
            params={{ unanswered: unansweredOnly ? "1" : undefined }}
            page={list.page}
            pageCount={list.pageCount}
          />
        </>
      )}
    </main>
  );
}
