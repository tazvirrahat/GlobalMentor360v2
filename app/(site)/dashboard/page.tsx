import type { Route } from "next";
import Link from "next/link";
import { Hourglass } from "lucide-react";
import { CertificateChip } from "@/components/course/certificate";
import { ContinueCard } from "@/components/course/continue-card";
import { CoverMark } from "@/components/course/cover-mark";
import { courseImageUrl } from "@/lib/course-image";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getContinueLearning } from "@/lib/continue-learning";
import { defaultLearningTab, listPendingPayments } from "@/lib/dashboard";
import { getMyLearning, type MyLearningEntry } from "@/lib/my-learning";
import { requireUser } from "@/lib/session";
import { archiveCourseAction } from "./actions";

export const metadata = {
  title: "My learning",
  description: "Your courses, progress and certificates.",
};

export const dynamic = "force-dynamic";

function CourseEntry({ entry, archived }: { entry: MyLearningEntry; archived: boolean }) {
  const done = entry.percent >= 100;
  const percent = Math.floor(entry.percent);
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 flex-1 gap-4">
        <CoverMark
          title={entry.title}
          slug={entry.slug}
          imageUrl={courseImageUrl(entry.courseId, entry.thumbnailUrl)}
          size={48}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={`/learn/${entry.slug}` as Route}
            className="min-h-6 w-fit rounded-sm text-base leading-snug font-semibold text-ink hover:underline focus-ring"
          >
            {entry.title}
          </Link>
          <p className="text-sm text-graphite">{entry.instructorName}</p>
          <div className="flex items-center gap-3">
            <Progress value={entry.percent} aria-label={`Course progress ${percent}%`} className="h-1.5 max-w-60" />
            <span className="shrink-0 text-sm text-graphite">{done ? "Completed" : `${percent}% complete`}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {done && entry.certificateSerial ? <CertificateChip serial={entry.certificateSerial} /> : null}
        <Button asChild variant={done ? "secondary" : "default"}>
          <Link href={`/learn/${entry.slug}` as Route} aria-label={`${done ? "Review" : "Continue"} ${entry.title}`}>
            {done ? "Review" : "Continue"}
          </Link>
        </Button>
        <form action={archiveCourseAction}>
          <input type="hidden" name="courseId" value={entry.courseId} />
          <input type="hidden" name="archived" value={archived ? "false" : "true"} />
          <Button type="submit" variant="ghost" aria-label={`${archived ? "Unarchive" : "Archive"} ${entry.title}`}>
            {archived ? "Unarchive" : "Archive"}
          </Button>
        </form>
      </div>
    </li>
  );
}

function CourseList({ entries, archived = false }: { entries: MyLearningEntry[]; archived?: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-rule border-y border-rule">
      {entries.map((entry) => (
        <CourseEntry key={entry.courseId} entry={entry} archived={archived} />
      ))}
    </ul>
  );
}

function Empty({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-graphite">{message}</p>
      <Button asChild>
        <Link href="/courses">Browse courses</Link>
      </Button>
    </div>
  );
}

/**
 * My learning: where you left off, anything waiting on payment, then
 * your courses in tabs that open on the first non-empty one. Account, orders
 * and sign-out live in the account menu, not here.
 */
export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const [{ inProgress, completed, archived }, continueLearning, pending] = await Promise.all([
    getMyLearning(user.id),
    getContinueLearning(user.id),
    listPendingPayments(user.id),
  ]);
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const tab = defaultLearningTab({
    inProgress: inProgress.length,
    completed: completed.length,
    archived: archived.length,
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">My learning</h1>
        <p className="text-lg text-graphite">Welcome back, {firstName}.</p>
      </div>

      {pending.map((payment) => (
        <Alert key={payment.orderId} variant="caution">
          <Hourglass className="size-4" />
          <AlertTitle>Payment being checked</AlertTitle>
          <AlertDescription>
            <p>
              Your bKash payment for {new Intl.ListFormat("en").format(payment.courseTitles)} is waiting for
              verification. The course opens as soon as it is confirmed.
            </p>
            <Link
              href={`/orders/${payment.orderId}` as Route}
              className="inline-flex min-h-6 items-center rounded-sm font-medium text-ink underline underline-offset-4 focus-ring"
            >
              View order
            </Link>
          </AlertDescription>
        </Alert>
      ))}

      {continueLearning ? <ContinueCard data={continueLearning} heading="Pick up where you left off" /> : null}

      <section aria-labelledby="courses-heading" className="flex flex-col gap-4">
        <h2 id="courses-heading" className="text-2xl font-semibold">
          Your courses
        </h2>
        <Tabs defaultValue={tab}>
          <TabsList variant="line" className="h-auto w-full justify-start gap-2 border-b border-rule">
            <TabsTrigger value="in-progress" className="min-h-11 flex-none px-3">
              In progress ({inProgress.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="min-h-11 flex-none px-3">
              Completed ({completed.length})
            </TabsTrigger>
            {archived.length > 0 ? (
              <TabsTrigger value="archived" className="min-h-11 flex-none px-3">
                Archived ({archived.length})
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="in-progress" className="mt-2">
            {inProgress.length === 0 ? (
              <Empty
                title={completed.length === 0 ? "No courses yet" : "Nothing in progress"}
                message={
                  completed.length === 0
                    ? "Courses you enrol in appear here, with your progress."
                    : "You have finished everything you started. Find your next course."
                }
              />
            ) : (
              <CourseList entries={inProgress} />
            )}
          </TabsContent>
          <TabsContent value="completed" className="mt-2">
            {completed.length === 0 ? (
              <Empty
                title="No finished courses yet"
                message="Finish every lesson and quiz in a course to get its certificate."
              />
            ) : (
              <CourseList entries={completed} />
            )}
          </TabsContent>
          {archived.length > 0 ? (
            <TabsContent value="archived" className="mt-2">
              <p className="py-3 text-sm text-graphite">
                Archived courses are only hidden from your list. You keep access, and your progress is saved.
              </p>
              <CourseList entries={archived} archived />
            </TabsContent>
          ) : null}
        </Tabs>
      </section>
    </main>
  );
}
