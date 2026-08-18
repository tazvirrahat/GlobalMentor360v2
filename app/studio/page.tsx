import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageNav } from "@/components/site/page-nav";
import { CourseStatusBadge } from "@/components/site/status-badges";
import { db } from "@/lib/db";
import { courseSellabilityWarning } from "@/lib/payments";
import { requireRole } from "@/lib/session";
import { listInstructorCourses } from "@/lib/studio";
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
  const [{ items: courses, page, pageCount }, categories] = await Promise.all([
    listInstructorCourses(user.id, rawPage),
    db.category.findMany({
      where: { parentId: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Studio</h1>
      <p className="mt-2 text-muted-foreground">Create and manage your courses.</p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <section>
          <h2 className="text-xl font-bold">Your courses</h2>
          {courses.length === 0 ? (
            <p className="mt-4 text-muted-foreground">No courses yet — create your first one.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {courses.map((course) => {
                const warning =
                  course.status === "PUBLISHED" ? courseSellabilityWarning(course.prices) : null;
                return (
                  <li key={course.id}>
                    <Card className="rounded-2xl transition-shadow hover:shadow-md">
                      <CardContent className="flex flex-wrap items-center gap-3 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/studio/courses/${course.id}`}
                            className="font-semibold hover:text-brand"
                          >
                            {course.title}
                          </Link>
                          <p className="text-sm text-muted-foreground">
                            {course._count.sections} sections · {course.enrollmentCount} enrolled
                          </p>
                          {warning ? (
                            <p className="mt-1 flex items-start gap-1 text-sm font-medium text-destructive">
                              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                              {warning}
                            </p>
                          ) : null}
                        </div>
                        <CourseStatusBadge status={course.status} />
                        {course.status === "PUBLISHED" ? (
                          <Link
                            href={`/courses/${course.slug}`}
                            className="flex items-center gap-1 text-sm text-brand hover:underline"
                          >
                            Public page <ExternalLink className="size-3.5" aria-hidden />
                          </Link>
                        ) : null}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
          <PageNav pathname="/studio" page={page} pageCount={pageCount} />
        </section>

        <section>
          <Card className="rounded-2xl">
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
