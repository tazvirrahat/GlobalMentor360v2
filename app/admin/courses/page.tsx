import Link from "next/link";
import { BookOpen, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/site/empty-state";
import { FlashAlert } from "@/components/site/flash-alert";
import { PageNav } from "@/components/site/page-nav";
import { CourseStatusBadge } from "@/components/site/status-badges";
import { ADMIN_PAGE_SIZE, listAdminCourses } from "@/lib/admin";
import { showingRange } from "@/lib/pagination";
import { courseSellabilityWarning } from "@/lib/payments";
import { requireRole } from "@/lib/session";
import { publishCourseAction } from "../actions";

export const metadata = { title: "Courses | Admin" };

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; page?: string }>;
}) {
  await requireRole("ADMIN");
  const { q, error, page: rawPage } = await searchParams;
  const { items: courses, total, page, pageCount } = await listAdminCourses(q?.trim(), rawPage);
  const range = showingRange(page, ADMIN_PAGE_SIZE, total);

  const pager = (
    <>
      {courses.length > 0 ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          Showing {range.from}–{range.to} of {total}
        </p>
      ) : null}
      <PageNav pathname="/admin/courses" params={{ q }} page={page} pageCount={pageCount} />
    </>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Courses</h1>
      {error ? <FlashAlert title="Could not update course">{error}</FlashAlert> : null}
      <form
        className="mt-4 flex min-w-0 max-w-md flex-col gap-2 sm:flex-row"
        action="/admin/courses"
        role="search"
      >
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search title or slug"
          aria-label="Search courses"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {courses.length === 0 ? (
        q?.trim() ? (
          <EmptyState
            className="mt-8"
            icon={<Search className="size-6" />}
            title="No courses match"
            message={`No courses match “${q.trim()}”. Try a different search.`}
          >
            <Button asChild>
              <Link href="/admin/courses" className="cursor-pointer">
                Clear search
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            className="mt-8"
            icon={<BookOpen className="size-6" />}
            title="No courses yet"
            message="Courses appear here when instructors create them."
          />
        )
      ) : (
        <div className="mt-4 min-w-0 space-y-2">
          {pager}
          <div className="w-0 min-w-full overflow-x-auto rounded-lg border bg-card shadow-sm">
            <ul>
              {courses.map((course) => {
                const published = course.status === "PUBLISHED";
                const warning = published ? courseSellabilityWarning(course.prices) : null;
                return (
                  <li
                    key={course.id}
                    className="flex min-w-[36rem] flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate"
                        title={`${course.title} · ${course.instructor.name}`}
                      >
                        <span className="font-medium">{course.title}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {course.instructor.name} ·{" "}
                          <span className="tabular-nums">{course.enrollmentCount}</span> enrolled
                        </span>
                      </p>
                      {warning ? (
                        <p className="mt-0.5 flex items-start gap-1 text-xs font-medium text-destructive">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {warning}
                        </p>
                      ) : null}
                    </div>
                    <CourseStatusBadge status={course.status} />
                    {published ? (
                      <Link
                        href={`/courses/${course.slug}`}
                        className="cursor-pointer text-sm text-primary hover:underline"
                      >
                        View
                      </Link>
                    ) : null}
                    <form action={publishCourseAction}>
                      <input type="hidden" name="courseId" value={course.id} />
                      <input type="hidden" name="publish" value={published ? "false" : "true"} />
                      <Button type="submit" size="sm" variant="outline">
                        {published ? "Unpublish" : "Publish"}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
          {pager}
        </div>
      )}
    </main>
  );
}
