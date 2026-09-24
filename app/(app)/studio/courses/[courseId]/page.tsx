import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/course/status-badge";
import { courseSellabilityWarning } from "@/lib/payments";
import { requireRole } from "@/lib/session";
import { getOwnedCourse, readinessChecks } from "@/lib/studio";
import { PublishForm, SettingsForm } from "./settings-form";

export const metadata = { title: "Course settings | Studio" };
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
  const sellabilityWarning = courseSellabilityWarning(course.prices);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/studio"
        className="inline-flex w-fit cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Studio
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{course.title}</h1>
        <StatusBadge kind="course" status={course.status} />
      </div>

      {sellabilityWarning ? (
        <Alert
          className="mt-6"
          variant={course.status === "PUBLISHED" ? "destructive" : "caution"}
        >
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>
            {course.status === "PUBLISHED" ? "Live but unpayable" : "Not payable yet"}
          </AlertTitle>
          <AlertDescription>{sellabilityWarning}</AlertDescription>
        </Alert>
      ) : null}

      <Button asChild variant="outline" className="mt-4">
        <Link href={`/studio/courses/${course.id}/curriculum`} className="cursor-pointer">
          Edit curriculum <ChevronRight className="size-4" aria-hidden />
        </Link>
      </Button>

      <div className="mt-8 grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Readiness</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm">
                {checks.map((check) => (
                  <li key={check.label} className="flex items-start gap-2">
                    {check.ok ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
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
          <Card>
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
