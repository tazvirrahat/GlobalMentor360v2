import Link from "next/link";
import { EmptyState } from "@/components/site/empty-state";
import { FlashAlert } from "@/components/site/flash-alert";
import { StarRating } from "@/components/site/star-rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADMIN_PAGE_SIZE, listAdminReviews } from "@/lib/admin";
import { showingRange } from "@/lib/pagination";
import { requireRole } from "@/lib/session";
import { moderateReviewAction } from "../actions";
import { PageNav } from "@/components/site/page-nav";

export const metadata = { title: "Reviews | Admin" };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; page?: string }>;
}) {
  await requireRole("ADMIN");
  const { error, page: rawPage } = await searchParams;
  const { items: reviews, total, page, pageCount } = await listAdminReviews(rawPage);
  const range = showingRange(page, ADMIN_PAGE_SIZE, total);

  const pager = (
    <>
      {reviews.length > 0 ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          Showing {range.from}–{range.to} of {total}
        </p>
      ) : null}
      <PageNav pathname="/admin/reviews" page={page} pageCount={pageCount} />
    </>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Reviews</h1>
      <p className="mt-1 text-muted-foreground">Hide or restore learner reviews.</p>
      {error ? <FlashAlert title="Could not update review">{error}</FlashAlert> : null}

      {reviews.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No reviews yet"
          message="Reviews appear here after learners rate a course. You can hide or restore them."
        />
      ) : (
        <div className="mt-4 min-w-0 space-y-2">
          {pager}
          <div className="w-0 min-w-full overflow-x-auto rounded-lg border bg-card shadow-sm">
            <ul>
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="flex min-w-[36rem] flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2">
                      <StarRating value={review.rating} starClassName="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{review.user.name}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          ·{" "}
                          <Link
                            href={`/courses/${review.course.slug}`}
                            className="cursor-pointer hover:text-primary"
                          >
                            {review.course.title}
                          </Link>
                          {review.body ? ` · ${review.body}` : null}
                        </span>
                      </span>
                    </p>
                  </div>
                  <Badge variant={review.status === "VISIBLE" ? "success" : "secondary"}>
                    {review.status}
                  </Badge>
                  <form action={moderateReviewAction}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input
                      type="hidden"
                      name="visible"
                      value={review.status === "VISIBLE" ? "false" : "true"}
                    />
                    <Button type="submit" size="sm" variant="outline">
                      {review.status === "VISIBLE" ? "Hide" : "Restore"}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
          {pager}
        </div>
      )}
    </main>
  );
}
