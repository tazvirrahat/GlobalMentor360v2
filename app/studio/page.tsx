import Link from "next/link";
import { ExternalLink, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listInstructorCourses } from "@/lib/studio";
import { NewCourseForm } from "./new-course-form";

export const metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const [courses, categories] = await Promise.all([
    listInstructorCourses(user.id),
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

      {/* The way in to everything that is not scoped to one course. A studio
          surface with no link from here is reachable only by typing its URL,
          which is how the quiz builder shipped orphaned past a green build. */}
      <nav aria-label="Studio sections" className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/studio/announcements">
            <Megaphone className="size-4" aria-hidden /> Announcements
          </Link>
        </Button>
      </nav>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <section>
          <h2 className="text-xl font-bold">Your courses</h2>
          {courses.length === 0 ? (
            <p className="mt-4 text-muted-foreground">No courses yet — create your first one.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {courses.map((course) => (
                <li key={course.id}>
                  <Card className="rounded-xl transition-shadow hover:shadow-md">
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
                      </div>
                      <Badge variant={course.status === "PUBLISHED" ? "default" : "secondary"}>
                        {course.status}
                      </Badge>
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
              ))}
            </ul>
          )}
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
