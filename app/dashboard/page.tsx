import type { Route } from "next";
import Link from "next/link";
import { Archive, Award, BookOpen, CheckCircle2, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMyLearning, type MyLearningEntry } from "@/lib/my-learning";
import { getUserRoles, requireUser } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export const metadata = {
  title: "My Learning",
  description: "Your enrolled courses, progress and certificates.",
};

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

function EnrolledCourseCard({ entry }: { entry: MyLearningEntry }) {
  const done = entry.percent >= 100;
  // typedRoutes cannot validate runtime-built strings; both routes exist
  // (player and public certificates are separate segments), so the casts are contained.
  const learnHref = `/learn/${entry.slug}` as Route;

  return (
    <Card className="rounded-2xl py-0 transition-shadow hover:shadow-brand">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {/* Cover placeholder — matches the catalog card until thumbnails land. */}
        <div
          className="flex h-20 w-full shrink-0 items-center justify-center rounded-xl bg-hero-gradient sm:w-32"
          aria-hidden
        >
          <span className="text-2xl font-extrabold text-white/25">
            {entry.title.slice(0, 2).toUpperCase()}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={learnHref} className="font-bold leading-snug hover:text-brand">
              {entry.title}
            </Link>
            {done ? (
              <Badge className="bg-brand text-primary-foreground">
                <CheckCircle2 aria-hidden />
                Completed
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {entry.instructorName}
            {entry.categoryName ? ` · ${entry.categoryName}` : ""}
            {` · ${LEVEL_LABEL[entry.level] ?? entry.level}`}
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Progress value={entry.percent} className="max-w-64" aria-label="Course progress" />
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
              {entry.percent}%
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {done && entry.certificateSerial ? (
            <Button asChild variant="outline">
              <Link href={`/certificates/${entry.certificateSerial}` as Route}>
                <Award aria-hidden />
                View certificate
              </Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href={learnHref}>
              <PlayCircle aria-hidden />
              {done ? "Review" : "Continue"}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="rounded-2xl border-dashed">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand text-primary-foreground">
          <BookOpen className="size-6" aria-hidden />
        </span>
        <p className="max-w-sm text-muted-foreground">{message}</p>
        <Button asChild className="shadow-brand">
          <Link href="/courses">Browse courses</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const roles = await getUserRoles(user.id);
  const { inProgress, completed, archived } = await getMyLearning(user.id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Welcome back, <span className="text-brand">{user.name}</span>
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
        <SignOutButton />
      </header>

      <section className="mt-10">
        <h2 className="sr-only">My learning</h2>
        <Tabs defaultValue="in-progress">
          <TabsList>
            <TabsTrigger value="in-progress">In progress ({inProgress.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
            {archived.length > 0 ? (
              <TabsTrigger value="archived">
                <Archive aria-hidden />
                Archived ({archived.length})
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="in-progress" className="mt-4 space-y-4">
            {inProgress.length === 0 ? (
              <EmptyState
                message={
                  completed.length === 0
                    ? "You haven't enrolled in any courses yet. Pick one and start learning today."
                    : "Nothing in progress — everything you enrolled in is done. Time for a new challenge?"
                }
              />
            ) : (
              inProgress.map((entry) => <EnrolledCourseCard key={entry.courseId} entry={entry} />)
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4 space-y-4">
            {completed.length === 0 ? (
              <EmptyState message="No completed courses yet — finish a course to earn your certificate." />
            ) : (
              completed.map((entry) => <EnrolledCourseCard key={entry.courseId} entry={entry} />)
            )}
          </TabsContent>

          {archived.length > 0 ? (
            <TabsContent value="archived" className="mt-4 space-y-4">
              {archived.map((entry) => (
                <EnrolledCourseCard key={entry.courseId} entry={entry} />
              ))}
            </TabsContent>
          ) : null}
        </Tabs>
      </section>
    </main>
  );
}
