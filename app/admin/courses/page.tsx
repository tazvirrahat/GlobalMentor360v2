import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FlashAlert } from "@/components/site/flash-alert";
import { PageNav } from "@/components/site/page-nav";
import { CourseStatusBadge } from "@/components/site/status-badges";
import { listAdminCourses } from "@/lib/admin";
import { courseSellabilityWarning } from "@/lib/payments";
import { requireRole } from "@/lib/session";
import { publishCourseAction } from "../actions";

export const metadata = { title: "Courses — Admin" };

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; page?: string }>;
}) {
  await requireRole("ADMIN");
  const { q, error, page: rawPage } = await searchParams;
  const { items: courses, page, pageCount } = await listAdminCourses(q?.trim(), rawPage);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Courses</h1>
      {error ? <FlashAlert title="Could not update course">{error}</FlashAlert> : null}
      <form className="mt-4 flex min-w-0 max-w-md flex-col gap-2 sm:flex-row" action="/admin/courses" role="search">
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

      <ul className="mt-8 flex flex-col gap-4">
        {courses.length === 0 ? (
          <p className="text-muted-foreground">No courses match that search.</p>
        ) : (
          courses.map((course) => {
          const published = course.status === "PUBLISHED";
          const warning = published ? courseSellabilityWarning(course.prices) : null;
          return (
            <li key={course.id} className="flex flex-wrap items-center gap-3 rounded-2xl border p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{course.title}</p>
                <p className="text-sm text-muted-foreground">
                  {course.instructor.name} · {course.enrollmentCount} enrolled
                </p>
                {warning ? (
                  <p className="mt-1 flex items-start gap-1 text-sm font-medium text-destructive">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {warning}
                  </p>
                ) : null}
              </div>
              <CourseStatusBadge status={course.status} />
              {published ? (
                <Link href={`/courses/${course.slug}`} className="text-sm text-brand hover:underline">
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
        })
        )}
      </ul>
      <PageNav pathname="/admin/courses" params={{ q }} page={page} pageCount={pageCount} />
    </main>
  );
}
