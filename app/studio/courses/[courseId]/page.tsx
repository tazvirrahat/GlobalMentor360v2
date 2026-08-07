import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, CircleCheck, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { getOwnedCourse, readinessChecks } from "@/lib/studio";
import { PublishForm, SettingsForm } from "./settings-form";

export const metadata = { title: "Course settings — Studio" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string }> };

export default async function CourseSettingsPage({ params }: Params) {
  const { courseId } = await params;
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  // Returns null for another instructor's course as well as a missing one, so a
  // 404 is the correct response either way — and it doesn't confirm existence.
  const course = await getOwnedCourse(courseId, user.id);
  if (!course) notFound();

  const checks = await readinessChecks(course.id);
  const ready = checks.every((check) => check.ok);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Link
        href="/studio"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Studio
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{course.title}</h1>
        <Badge variant={course.status === "PUBLISHED" ? "default" : "secondary"}>
          {course.status}
        </Badge>
      </div>

      <Button asChild variant="outline" className="mt-4">
        <Link href={`/studio/courses/${course.id}/curriculum`}>
          Edit curriculum <ChevronRight className="size-4" aria-hidden />
        </Link>
      </Button>

      <div className="mt-10 grid gap-8 lg:grid-cols-[360px_1fr]">
        <section>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Readiness</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm">
                {checks.map((check) => (
                  <li key={check.label} className="flex items-start gap-2">
                    {check.ok ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                    ) : (
                      <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                    )}
                    <span>
                      {check.label}
                      {check.ok ? null : (
                        <span className="block text-xs text-muted-foreground">{check.hint}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <PublishForm courseId={course.id} status={course.status} ready={ready} />
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <SettingsForm course={course} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
