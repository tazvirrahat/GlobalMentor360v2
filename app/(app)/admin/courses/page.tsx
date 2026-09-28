import type { Route } from "next";
import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { StatusBadge } from "@/components/course/status-badge";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { EmptyState } from "@/components/site/empty-state";
import { FlashAlert } from "@/components/site/flash-alert";
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
  tableLinkClass,
} from "@/components/ui/table";
import { ADMIN_PAGE_SIZE, listAdminCourses } from "@/lib/admin";
import { listReviewQueue } from "@/lib/course-review";
import { formatDateMedium } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { courseSellabilityWarning } from "@/lib/payments";
import { requireRole } from "@/lib/session";
import { publishCourseAction } from "../actions";
import { ReviewActions } from "./review-actions";

export const metadata = { title: "Courses | Admin" };

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; page?: string }>;
}) {
  await requireRole("ADMIN");
  const { q, error, page: rawPage } = await searchParams;
  const query = q?.trim() || undefined;
  const [{ items: courses, total, page, pageCount }, queue] = await Promise.all([
    listAdminCourses(query, rawPage),
    listReviewQueue(),
  ]);
  const range = showingRange(page, ADMIN_PAGE_SIZE, total);

  return (
    <main className="flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Courses" description="Every course on the site, from every instructor. Publish or take one down." />
      {error ? <FlashAlert title="Could not update course">{error}</FlashAlert> : null}

      {queue.length > 0 ? (
        <section aria-labelledby="review-heading" className="flex flex-col gap-3">
          <h2 id="review-heading" className="flex items-center gap-2 text-lg font-semibold">
            Waiting for review <Badge variant="warning">{queue.length}</Badge>
          </h2>
          <Table className="md:min-w-[44rem]">
            <TableCaption>Courses waiting for review</TableCaption>
            <colgroup>
              <col />
              <col className="hidden w-36 md:table-column" />
              <col className="w-48 md:w-64" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="hidden md:table-cell">Submitted</TableHead>
                <TableHead>
                  <span className="sr-only">Review</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium text-ink">{row.title}</span>
                      <span className="text-sm text-graphite">{row.instructorName}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-graphite md:table-cell">
                    {row.reviewRequestedAt ? (
                      <time dateTime={row.reviewRequestedAt.toISOString()}>{formatDateMedium(row.reviewRequestedAt)}</time>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <ReviewActions courseId={row.id} title={row.title} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <SearchBox
        action={"/admin/courses" as Route}
        label="Search courses"
        placeholder="Search title or slug"
        value={query}
      />

      {courses.length === 0 ? (
        query ? (
          <EmptyState title="No courses match" message={`No course matches “${query}”. Try another search.`} />
        ) : (
          <EmptyState title="No courses yet" message="Courses appear here when instructors create them." />
        )
      ) : (
        <>
          <Table className="md:min-w-[50rem]">
            <TableCaption>Courses</TableCaption>
            <colgroup>
              <col />
              <col className="hidden w-28 md:table-column" />
              <col className="hidden w-32 md:table-column" />
              <col className="hidden w-40 md:table-column" />
              <col className="w-36 md:w-48" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="hidden text-right md:table-cell">Learners</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">
                  <span className="sr-only">Course page</span>
                </TableHead>
                <TableHead>
                  <span className="sr-only">Publish</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => {
                const published = course.status === "PUBLISHED";
                const warning = published ? courseSellabilityWarning(course.prices) : null;
                return (
                  <TableRow key={course.id}>
                    <TableCell>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <Link href={`/admin/courses/${course.id}` as Route} className={tableLinkClass}>
                          {course.title}
                        </Link>
                        <span className="text-sm text-graphite">{course.instructor.name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 md:hidden">
                          <StatusBadge kind="course" status={course.status} />
                          <span className="text-sm text-graphite">
                            {course.enrollmentCount} {course.enrollmentCount === 1 ? "learner" : "learners"}
                          </span>
                        </span>
                        {warning ? (
                          <span className="flex items-start gap-1 text-sm font-medium text-seal">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                            {warning}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{course.enrollmentCount}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <StatusBadge kind="course" status={course.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {published ? (
                        <Link
                          href={`/courses/${course.slug}` as Route}
                          className="inline-flex min-h-8 items-center gap-1 rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                        >
                          Course page <ExternalLink className="size-3.5" aria-hidden />
                          <span className="sr-only">for {course.title}</span>
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={publishCourseAction} className="flex justify-end">
                        <input type="hidden" name="courseId" value={course.id} />
                        <input type="hidden" name="publish" value={published ? "false" : "true"} />
                        {published ? (
                          <ConfirmSubmit
                            label="Unpublish"
                            question="Take it off the catalog?"
                            confirmLabel="Yes, unpublish"
                            variant="secondary"
                          />
                        ) : (
                          <Button type="submit" size="sm" variant="secondary">
                            Publish
                          </Button>
                        )}
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
            pathname="/admin/courses"
            params={{ q: query }}
            page={page}
            pageCount={pageCount}
          />
        </>
      )}
    </main>
  );
}
