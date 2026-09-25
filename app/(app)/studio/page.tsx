import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/site/empty-state";
import { PageNav } from "@/components/site/page-nav";
import { StatusBadge } from "@/components/course/status-badge";
import { formatDate } from "@/lib/format";
import { db } from "@/lib/db";
import { courseSellabilityWarning } from "@/lib/payments";
import { requireRole } from "@/lib/session";
import { showingRange } from "@/lib/pagination";
import { listInstructorCourses, STUDIO_COURSE_PAGE_SIZE } from "@/lib/studio";
import { NewCourseForm } from "./new-course-form";

export const metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const { page: rawPage } = await searchParams;
  const [{ items: courses, total, page, pageCount }, categories] = await Promise.all([
    listInstructorCourses(user.id, rawPage),
    db.category.findMany({
      where: { parentId: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const range = showingRange(page, STUDIO_COURSE_PAGE_SIZE, total);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Studio</h1>
        <p className="mt-2 text-muted-foreground">Create and manage your courses.</p>
      </header>

      <div className="mt-8 grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          <h2 className="font-heading text-xl font-semibold tracking-tight">Your courses</h2>
          {courses.length === 0 ? (
            <EmptyState
              className="mt-4"
              title="No courses yet"
              message="Create your first course to start teaching."
            >
              <Button asChild>
                <Link href="#create-course" className="cursor-pointer">
                  Create a course
                </Link>
              </Button>
            </EmptyState>
          ) : (
            <div className="mt-3 flex min-w-0 flex-col gap-2">
              <p className="text-sm tabular-nums text-muted-foreground">
                Showing {range.from}–{range.to} of {total}
              </p>
              <PageNav pathname="/studio" page={page} pageCount={pageCount} />
              <div className="w-0 min-w-full overflow-x-auto rounded-lg border bg-card shadow-sm">
                <div className="hidden min-w-[40rem] border-b bg-muted/40 px-3 py-1.5 text-sm font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_7rem_6.5rem_7.5rem_auto] md:items-center md:gap-3">
                  <span>Title</span>
                  <span>Status</span>
                  <span className="text-right">Learners</span>
                  <span className="text-right">Updated</span>
                  <span className="sr-only">Actions</span>
                </div>
                <ul>
                  {courses.map((course) => {
                    const warning =
                      course.status === "PUBLISHED" ? courseSellabilityWarning(course.prices) : null;
                    return (
                      <li
                        key={course.id}
                        className="border-b border-border last:border-b-0 hover:bg-muted/50"
                      >
                        <div className="grid items-center gap-1 px-3 py-2 md:min-w-[40rem] md:grid-cols-[minmax(0,1fr)_7rem_6.5rem_7.5rem_auto] md:gap-3">
                          <div className="min-w-0">
                            <p className="truncate" title={course.title}>
                              <Link
                                href={`/studio/courses/${course.id}`}
                                className="cursor-pointer font-medium hover:text-primary"
                              >
                                {course.title}
                              </Link>
                              <span className="text-xs text-muted-foreground">
                                {" "}
                                · {course._count.sections}{" "}
                                {course._count.sections === 1 ? "section" : "sections"}
                              </span>
                            </p>
                            {warning ? (
                              <p className="mt-0.5 flex items-start gap-1 text-xs font-medium text-destructive">
                                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                {warning}
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <StatusBadge kind="course" status={course.status} />
                          </div>
                          <p className="text-sm tabular-nums text-muted-foreground md:text-right">
                            <span className="md:hidden">Learners · </span>
                            {course.enrollmentCount}
                          </p>
                          <p className="text-sm tabular-nums text-muted-foreground md:text-right">
                            <span className="md:hidden">Updated · </span>
                            {formatDate(course.updatedAt)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {course.status === "PUBLISHED" ? (
                              <Link
                                href={`/courses/${course.slug}`}
                                className="inline-flex min-h-9 cursor-pointer items-center gap-1 text-sm text-primary hover:underline"
                              >
                                Public page <ExternalLink className="size-3.5" aria-hidden />
                              </Link>
                            ) : (
                              <span className="hidden text-sm text-muted-foreground md:inline">—</span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <PageNav pathname="/studio" page={page} pageCount={pageCount} />
            </div>
          )}
        </section>

        <section id="create-course" className="order-first scroll-mt-24 lg:order-none">
          <Card>
            <CardHeader>
              <CardTitle>Create a course</CardTitle>
            </CardHeader>
            <CardContent>
              <NewCourseForm categories={categories} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
