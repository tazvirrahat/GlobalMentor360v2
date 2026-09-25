import type { Route } from "next";
import Link from "next/link";
import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { EmptyState } from "@/components/site/empty-state";
import { FlashAlert } from "@/components/site/flash-alert";
import { StarRating } from "@/components/site/star-rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_PAGE_SIZE, listAdminReviews } from "@/lib/admin";
import { formatDateMedium } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { requireRole } from "@/lib/session";
import { moderateReviewAction } from "../actions";

export const metadata = { title: "Reviews | Admin" };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; page?: string; q?: string }>;
}) {
  await requireRole("ADMIN");
  const { error, page: rawPage, q } = await searchParams;
  const query = q?.trim() || undefined;
  const { items: reviews, total, page, pageCount } = await listAdminReviews(query, rawPage);
  const range = showingRange(page, ADMIN_PAGE_SIZE, total);

  return (
    <main className="flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Reviews"
        description="Hide a review that breaks the rules, or show it again. Hidden reviews don't count toward the rating."
      />
      {error ? <FlashAlert title="Could not update review">{error}</FlashAlert> : null}

      <SearchBox
        action={"/admin/reviews" as Route}
        label="Search reviews"
        placeholder="Course, learner, or words in the review"
        value={query}
      />

      {reviews.length === 0 ? (
        query ? (
          <EmptyState title="No reviews match" message={`Nothing matches “${query}”. Try another search.`} />
        ) : (
          <EmptyState title="No reviews yet" message="Reviews appear here after learners rate a course." />
        )
      ) : (
        <>
          <Table className="md:min-w-[52rem]">
            <TableCaption>Reviews</TableCaption>
            <colgroup>
              <col className="md:w-56" />
              <col className="hidden md:table-column" />
              <col className="hidden w-32 md:table-column" />
              <col className="hidden w-24 md:table-column" />
              <col className="w-24 md:w-28" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Course and learner</TableHead>
                <TableHead className="hidden md:table-cell">Review</TableHead>
                <TableHead className="hidden md:table-cell">Posted</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead>
                  <span className="sr-only">Hide or show</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((review) => {
                const visible = review.status === "VISIBLE";
                return (
                  <TableRow key={review.id} className="align-top">
                    <TableCell className="align-top">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <Link
                          href={`/courses/${review.course.slug}` as Route}
                          className="inline-flex min-h-6 w-fit items-center rounded-sm font-medium text-ink hover:underline focus-ring"
                        >
                          {review.course.title}
                        </Link>
                        <span className="text-sm text-graphite">{review.user.name}</span>
                        <span className="mt-1 flex flex-col gap-1 md:hidden">
                          <StarRating value={review.rating} starClassName="size-4 shrink-0" />
                          {review.body ? <span className="line-clamp-3 text-ink">{review.body}</span> : null}
                          <Badge variant={visible ? "success" : "secondary"}>{visible ? "Shown" : "Hidden"}</Badge>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden align-top md:table-cell">
                      <span className="flex flex-col gap-1">
                        <StarRating value={review.rating} starClassName="size-4 shrink-0" />
                        {review.body ? (
                          <span className="line-clamp-3 text-ink">{review.body}</span>
                        ) : (
                          <span className="text-sm text-graphite">Rating only, no text</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden align-top text-graphite md:table-cell">
                      <time dateTime={review.createdAt.toISOString()}>{formatDateMedium(review.createdAt)}</time>
                    </TableCell>
                    <TableCell className="hidden align-top md:table-cell">
                      <Badge variant={visible ? "success" : "secondary"}>{visible ? "Shown" : "Hidden"}</Badge>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <form action={moderateReviewAction}>
                        <input type="hidden" name="reviewId" value={review.id} />
                        <input type="hidden" name="visible" value={visible ? "false" : "true"} />
                        <Button type="submit" size="sm" variant="secondary">
                          {visible ? "Hide" : "Show"}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ListFooter
            range={range}
            total={total}
            pathname="/admin/reviews"
            params={{ q: query }}
            page={page}
            pageCount={pageCount}
          />
        </>
      )}
    </main>
  );
}
