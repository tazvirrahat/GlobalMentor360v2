import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Bar } from "@/components/app/bar";
import { CourseEditorNav } from "@/components/app/course-editor-nav";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { StatusBadge } from "@/components/course/status-badge";
import { EmptyState } from "@/components/site/empty-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCourseAnalytics } from "@/lib/course-analytics";
import { biggestDrop, percentOf } from "@/lib/course-analytics-rules";
import { requireRole } from "@/lib/session";
import { getOwnedCourse } from "@/lib/studio";

export const metadata = { title: "Analytics | Studio" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string }> };

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// Schibsted's tabular figures give "." a whole figure's width, so a decimal
// (the rating) is set in proportional figures.
function Figure({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-surface p-4">
      <dt className="text-sm text-graphite">{label}</dt>
      <dd className="flex flex-col">
        <span className={`text-2xl font-semibold text-ink ${value.includes(".") ? "" : "tabular-nums"}`}>{value}</span>
        {detail ? <span className="text-sm text-graphite">{detail}</span> : null}
      </dd>
    </div>
  );
}

/** The course editor's Analytics section: how many people enrol, finish, rate it, and where they stop. */
export default async function CourseAnalyticsPage({ params }: Params) {
  const { courseId } = await params;
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  // Owner only, and a 404 for anyone else's course, like the rest of the editor.
  const course = await getOwnedCourse(courseId, user.id);
  if (!course) notFound();

  const data = await getCourseAnalytics(course.id);
  const maxWeek = Math.max(0, ...data.weeks.map((week) => week.enrollments));
  const drop = biggestDrop(data.items, data.learners);

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        back={{ href: "/studio" as Route, label: "Courses" }}
        title={course.title}
        meta={<StatusBadge kind="course" status={course.status} />}
        actions={
          course.status === "PUBLISHED" ? (
            <Link
              href={`/courses/${course.slug}` as Route}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
            >
              Course page <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />
      <CourseEditorNav courseId={course.id} current="analytics" />

      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-graphite">
          Counts current learners; anyone refunded is left out. Weeks start on Monday.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-4">
        <Figure label="Learners" value={String(data.learners)} />
        <Figure
          label="Finished the course"
          value={String(data.completed)}
          detail={data.learners > 0 ? `${percentOf(data.completed, data.learners)}% of learners` : undefined}
        />
        <Figure label="New in the last 30 days" value={String(data.enrolledLast30Days)} />
        <Figure
          label="Rating"
          value={data.ratingAverage !== null ? data.ratingAverage.toFixed(1) : "–"}
          detail={data.ratingCount > 0 ? `from ${plural(data.ratingCount, "rating")}` : "No ratings yet"}
        />
      </dl>

      {data.learners === 0 ? (
        <EmptyState
          title="No learners yet"
          message="Enrollments, completions and ratings show here once people join the course."
        />
      ) : (
        <>
          <Panel title="Enrollments by week" description={`The last ${data.weeks.length} weeks.`}>
            <Table>
              <TableCaption>Enrollments by week</TableCaption>
              <colgroup>
                <col className="w-28" />
                <col />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Week of</TableHead>
                  <TableHead>Enrollments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.weeks.map((week) => (
                  <TableRow key={week.start}>
                    <TableCell>
                      <time dateTime={week.start}>{week.label}</time>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <span className="w-8 shrink-0 text-right tabular-nums">{week.enrollments}</span>
                        <Bar value={week.enrollments} max={maxWeek} className="max-w-md" />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          <Panel title="Rating by month" description="The average of the ratings given each month, out of 5.">
            {data.ratingMonths.every((month) => month.count === 0) ? (
              <p className="text-sm text-graphite">No ratings in the last {data.ratingMonths.length} months.</p>
            ) : (
              <Table>
                <TableCaption>Rating by month</TableCaption>
                <colgroup>
                  <col className="w-28" />
                  <col />
                  <col className="w-24" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Average</TableHead>
                    <TableHead className="text-right">Ratings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ratingMonths.map((month) => (
                    <TableRow key={month.month}>
                      <TableCell>
                        <time dateTime={month.month}>{month.label}</time>
                      </TableCell>
                      <TableCell>
                        {month.average !== null ? (
                          <span className="flex items-center gap-3">
                            <span className="w-8 shrink-0 text-right">{month.average.toFixed(1)}</span>
                            <Bar value={month.average} max={5} className="max-w-md" />
                          </span>
                        ) : (
                          <span className="text-graphite">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{month.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>

          <Panel
            title="Where learners stop"
            description="How many learners have finished each item, in course order. A big fall from one item to the next is where people stop."
          >
            {drop ? (
              <p className="text-ink">
                The biggest fall is after <strong className="font-semibold">{drop.after}</strong>: {drop.points} percentage{" "}
                {drop.points === 1 ? "point" : "points"} fewer learners finish{" "}
                <strong className="font-semibold">{drop.before}</strong>.
              </p>
            ) : null}
            {data.items.length === 0 ? (
              <p className="text-sm text-graphite">This course has no lectures or quizzes yet.</p>
            ) : (
              <Table>
                <TableCaption>Learners who finished each item</TableCaption>
                <colgroup>
                  <col className="hidden w-12 sm:table-column" />
                  <col />
                  <col className="w-32 sm:w-64" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden sm:table-cell">
                      <span className="sr-only">Position</span>
                    </TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Finished by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item, index) => {
                    const percent = percentOf(item.completed, data.learners);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="hidden text-graphite tabular-nums sm:table-cell">{index + 1}</TableCell>
                        <TableCell>
                          <span className="flex min-w-0 flex-col">
                            <span className="font-medium break-words text-ink">{item.title}</span>
                            <span className="text-sm text-graphite">
                              {item.type === "QUIZ" ? "Quiz" : "Lecture"} in {item.sectionTitle}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                            <span className="shrink-0 tabular-nums sm:w-24">
                              {item.completed} ({percent}%)
                            </span>
                            <Bar value={percent} max={100} />
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}
