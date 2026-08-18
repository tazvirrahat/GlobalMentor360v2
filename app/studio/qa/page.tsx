import type { Metadata, Route } from "next";
import Link from "next/link";
import { CircleCheck, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getInboxCourseFilters, getInstructorInbox } from "@/lib/qa";
import { formatDate } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { InboxReplyForm } from "./inbox-reply-form";
import { PageNav } from "@/components/site/page-nav";

export const metadata: Metadata = { title: "Q&A · Studio" };
export const dynamic = "force-dynamic";

type Params = {
  searchParams: Promise<{
    course?: string;
    courseId?: string;
    unanswered?: string;
    since?: string;
    page?: string;
  }>;
};

/** Date filters are offered as spans rather than a date picker: "what came in this week". */
const SINCE_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
] as const;

function sinceDate(days: string | undefined): Date | undefined {
  const parsed = Number(days);
  if (!days || Number.isNaN(parsed) || parsed <= 0) return undefined;
  return new Date(Date.now() - parsed * 24 * 60 * 60 * 1000);
}

/**
 * Status chips are links carrying searchParams. The course filter is a GET
 * form (like catalog search) so a long owned-course list stays one control.
 * Either way the filtered view is a URL, and the only client island is the
 * reply form.
 */
function buildHref(
  current: { courseId?: string; unanswered?: string; since?: string },
  patch: Partial<{ courseId: string; unanswered: string; since: string }>,
): Route {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.courseId) params.set("courseId", next.courseId);
  if (next.unanswered) params.set("unanswered", next.unanswered);
  if (next.since) params.set("since", next.since);
  const query = params.toString();
  return (query ? `/studio/qa?${query}` : "/studio/qa") as Route;
}

export default async function StudioQaPage({ searchParams }: Params) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const query = await searchParams;

  const unansweredOnly = query.unanswered === "1";
  const courseId = query.courseId || query.course || undefined;
  const filters = {
    courseId,
    unanswered: unansweredOnly ? "1" : undefined,
    since: query.since || undefined,
  };
  const [inbox, courseFilters] = await Promise.all([
    getInstructorInbox(user.id, {
      courseId,
      unansweredOnly,
      since: sinceDate(query.since),
      page: Number(query.page) || 1,
    }),
    getInboxCourseFilters(user.id),
  ]);

  const { courses, total: courseTotal, unansweredTotal } = courseFilters;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Questions</h1>
        <p className="mt-1 text-muted-foreground">
          {unansweredTotal === 0
            ? "Everything has an answer from you."
            : `${unansweredTotal} ${unansweredTotal === 1 ? "question is" : "questions are"} waiting on you.`}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Show</span>
          <Button asChild size="sm" variant={unansweredOnly ? "default" : "outline"}>
            <Link href={buildHref(filters, { unanswered: unansweredOnly ? "" : "1" })}>
              Needs my answer
            </Link>
          </Button>
        </div>

        <form action="/studio/qa" method="get" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="courseId" className="text-sm font-semibold">
              Course
            </label>
            <select
              id="courseId"
              name="courseId"
              defaultValue={courseId ?? ""}
              className="h-9 max-w-md min-w-[14rem] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.unanswered > 0
                    ? `${course.title} (${course.unanswered})`
                    : course.title}
                </option>
              ))}
            </select>
            {unansweredOnly ? <input type="hidden" name="unanswered" value="1" /> : null}
            {query.since ? <input type="hidden" name="since" value={query.since} /> : null}
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
          </div>
          {courseTotal > courses.length ? (
            <p className="text-sm text-muted-foreground">
              Showing {courses.length} of {courseTotal} courses, ordered by title.
            </p>
          ) : null}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Asked</span>
          {SINCE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              asChild
              size="sm"
              variant={(query.since ?? "") === option.value ? "default" : "outline"}
            >
              <Link href={buildHref(filters, { since: option.value })}>{option.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      {inbox.threads.length === 0 ? (
        <p className="text-muted-foreground">Nothing matches that filter.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {inbox.threads.map((thread) => (
            <li key={thread.id}>
              <Card className="rounded-2xl">
                <CardContent className="flex flex-col gap-2 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-bold">
                      {thread.answered ? (
                        <CircleCheck className="size-4 shrink-0 text-brand" aria-label="Answered" />
                      ) : (
                        <MessageCircleQuestion
                          className="size-4 shrink-0 text-destructive"
                          aria-label="Needs an answer"
                        />
                      )}
                      {thread.title}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {thread.courseTitle}
                      {thread.lectureTitle ? ` · ${thread.lectureTitle}` : " · course-wide"}
                    </span>
                  </div>

                  <p className="whitespace-pre-line text-sm text-muted-foreground">{thread.body}</p>

                  <p className="text-xs text-muted-foreground">
                    {thread.askedBy} · {formatDate(thread.createdAt)} ·{" "}
                    {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"} ·{" "}
                    <Link
                      href={`/learn/${thread.courseSlug}` as Route}
                      className="underline hover:text-foreground"
                    >
                      open in course
                    </Link>
                  </p>

                  <InboxReplyForm threadId={thread.id} title={thread.title} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <PageNav
        pathname="/studio/qa"
        params={{ courseId, unanswered: query.unanswered, since: query.since }}
        page={inbox.page}
        pageCount={inbox.pageCount}
      />
    </main>
  );
}
