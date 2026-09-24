import type { Route } from "next";
import Link from "next/link";
import { Archive, Award, BookOpen, PlayCircle, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignOutButton } from "@/components/site/sign-out-button";
import { EmptyState } from "@/components/site/empty-state";
import { courseLevelLabel } from "@/lib/labels";
import { getMyLearning, type MyLearningEntry } from "@/lib/my-learning";
import { getUserRoles, requireUser } from "@/lib/session";
import { CertificateChip } from "@/components/course/certificate";

export const metadata = {
  title: "My learning",
  description: "Your courses, progress and certificates.",
};

export const dynamic = "force-dynamic";

/** Visible cap before a disclosure — Coursera-style density, not a wall of cards. */
const DASHBOARD_PREVIEW = 8;

function EnrolledCourseRow({ entry }: { entry: MyLearningEntry }) {
  const done = entry.percent >= 100;
  // typedRoutes cannot validate runtime-built strings; both routes exist
  // (player and public certificates are separate segments), so the casts are contained.
  const learnHref = `/learn/${entry.slug}` as Route;
  const meta = [
    entry.instructorName,
    entry.categoryName,
    courseLevelLabel(entry.level),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="px-3 py-2.5 transition-colors duration-150 hover:bg-muted/50 sm:px-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={learnHref}
              className="min-w-0 truncate font-medium hover:text-primary"
              title={entry.title}
            >
              {entry.title}
            </Link>
            {done ? (
              <Badge variant="success" className="shrink-0">
                <Award aria-hidden />
                Completed
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground" title={meta}>
            {meta}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <Progress
              value={entry.percent}
              className="h-1.5"
              aria-label={`Course progress ${entry.percent}%`}
            />
            <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
              {entry.percent}%
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {done && entry.certificateSerial ? (
            <CertificateChip serial={entry.certificateSerial} />
          ) : null}
          <Button asChild size="sm">
            <Link href={learnHref} className="cursor-pointer">
              <PlayCircle aria-hidden />
              {done ? "Review" : "Continue"}
            </Link>
          </Button>
        </div>
      </div>
    </li>
  );
}

function CourseList({ entries }: { entries: MyLearningEntry[] }) {
  const preview = entries.slice(0, DASHBOARD_PREVIEW);
  const rest = entries.slice(DASHBOARD_PREVIEW);

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
      <ul className="divide-y">{preview.map((entry) => (
        <EnrolledCourseRow key={entry.courseId} entry={entry} />
      ))}</ul>
      {rest.length > 0 ? (
        <details className="border-t">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary underline-offset-4 hover:underline focus-ring">
            Show all {entries.length} courses
          </summary>
          <ul className="divide-y border-t">
            {rest.map((entry) => (
              <EnrolledCourseRow key={entry.courseId} entry={entry} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function LearningEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <EmptyState icon={<BookOpen className="size-6" aria-hidden />} title={title} message={message}>
      <Button asChild>
        <Link href="/courses" className="cursor-pointer">
          Browse courses
        </Link>
      </Button>
    </EmptyState>
  );
}

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const roles = await getUserRoles(user.id);
  const { inProgress, completed, archived } = await getMyLearning(user.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back, <span className="text-primary">{user.name}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            {roles.map((role) => (
              <Badge key={role} variant="secondary" className="capitalize">
                {role.toLowerCase()}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The only route into the purchase record. A page nothing links to is
              reachable only by typing its URL — the gap that left the quiz
              builder orphaned past a green build. */}
          <Button asChild variant="outline">
            <Link href={"/account" as Route} className="cursor-pointer">
              Account
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/orders" className="cursor-pointer">
              <Receipt className="size-4" aria-hidden /> Purchases
            </Link>
          </Button>
          <SignOutButton />
        </div>
      </header>

      <section className="mt-10">
        <h2 className="sr-only">My learning</h2>
        <Tabs defaultValue="in-progress">
          <TabsList className="flex h-auto w-full max-w-full flex-wrap justify-start">
            <TabsTrigger value="in-progress">In progress ({inProgress.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
            {archived.length > 0 ? (
              <TabsTrigger value="archived">
                <Archive aria-hidden />
                Archived ({archived.length})
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="in-progress" className="mt-4">
            {inProgress.length === 0 ? (
              <LearningEmptyState
                title={completed.length === 0 ? "No courses yet" : "Nothing in progress"}
                message={
                  completed.length === 0
                    ? "You haven't enrolled in any courses yet. Pick one and start learning today."
                    : "Nothing in progress — everything you enrolled in is done. Time for a new challenge?"
                }
              />
            ) : (
              <CourseList entries={inProgress} />
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            {completed.length === 0 ? (
              <LearningEmptyState
                title="No completed courses yet"
                message="No completed courses yet — finish a course to earn your certificate."
              />
            ) : (
              <CourseList entries={completed} />
            )}
          </TabsContent>

          {archived.length > 0 ? (
            <TabsContent value="archived" className="mt-4">
              <CourseList entries={archived} />
            </TabsContent>
          ) : null}
        </Tabs>
      </section>
    </main>
  );
}
