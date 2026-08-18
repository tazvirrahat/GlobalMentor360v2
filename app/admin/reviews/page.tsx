import Link from "next/link";
import { FlashAlert } from "@/components/site/flash-alert";
import { StarRating } from "@/components/site/star-rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAdminReviews } from "@/lib/admin";
import { requireRole } from "@/lib/session";
import { moderateReviewAction } from "../actions";
import { PageNav } from "@/components/site/page-nav";

export const metadata = { title: "Reviews — Admin" };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; page?: string }>;
}) {
  await requireRole("ADMIN");
  const { error, page: rawPage } = await searchParams;
  const { items: reviews, page, pageCount } = await listAdminReviews(rawPage);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Reviews</h1>
      <p className="mt-1 text-muted-foreground">Hide or restore learner reviews.</p>
      {error ? <FlashAlert title="Could not update review">{error}</FlashAlert> : null}

      <ul className="mt-8 flex flex-col gap-4">
        {reviews.length === 0 ? (
          <p className="text-muted-foreground">No reviews yet.</p>
        ) : (
          reviews.map((review) => (
            <li key={review.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <StarRating value={review.rating} starClassName="size-3.5" />
                  {review.user.name}
                </p>
                <Badge variant={review.status === "VISIBLE" ? "default" : "secondary"}>
                  {review.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link href={`/courses/${review.course.slug}`} className="hover:text-brand">
                  {review.course.title}
                </Link>
              </p>
              {review.body ? <p className="mt-2 text-sm">{review.body}</p> : null}
              <form action={moderateReviewAction} className="mt-3">
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
          ))
        )}
      </ul>
      <PageNav pathname="/admin/reviews" page={page} pageCount={pageCount} />
    </main>
  );
}
