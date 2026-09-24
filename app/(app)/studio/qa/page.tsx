import type { Metadata, Route } from "next";
import Link from "next/link";
import { CircleCheck, Inbox, MessageCircleQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/site/empty-state";
import { getInboxCourseFilters, getInstructorInbox, INBOX_PAGE_SIZE } from "@/lib/qa";
import { formatDate } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { requireRole } from "@/lib/session";
import { cn } from "@/lib/utils";
import { InboxReplyForm } from "./inbox-reply-form";
import { PageNav } from "@/components/site/page-nav";

export const metadata: Metadata = { title: "Q&A | Studio" };
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
  const filtered = Boolean(courseId || unansweredOnly || query.since);
  const range = showingRange(inbox.page, INBOX_PAGE_SIZE, inbox.total);

  const pager = (
    <>
      {inbox.threads.length > 0 ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          Showing {range.from}–{range.to} of {inbox.total}
        </p>
      ) : null}
      <PageNav
        pathname="/studio/qa"
        params={{ courseId, unanswered: query.unanswered, since: query.since }}
        page={inbox.page}
        pageCount={inbox.pageCount}
      />
    </>
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Questions</h1>
        <p className="mt-1 text-muted-foreground">
          {unansweredTotal === 0
            ? "Everything has an answer from you."
            : `${unansweredTotal} ${unansweredTotal === 1 ? "question is" : "questions are"} waiting on you.`}
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Show</span>
          <Button
            asChild
            size="sm"
            variant={unansweredOnly ? "default" : "outline"}
            className="rounded-full"
          >
            <Link href={buildHref(filters, { unanswered: unansweredOnly ? "" : "1" })}>
              Needs my answer
            </Link>
          </Button>
        </div>

        <form action="/studio/qa" method="get" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="courseId" className="cursor-pointer text-sm font-medium text-muted-foreground">
              Course
            </label>
            <select
              id="courseId"
              name="courseId"
              defaultValue={courseId ?? ""}
              className="h-10 max-w-md min-w-[14rem] cursor-pointer rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-ring"
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
          <span className="text-sm font-medium text-muted-foreground">Asked</span>
          {SINCE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              asChild
              size="sm"
              variant={(query.since ?? "") === option.value ? "default" : "outline"}
              className="rounded-full"
            >
              <Link href={buildHref(filters, { since: option.value })}>{option.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      {inbox.threads.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<Inbox className="size-6" />}
            title="No questions match"
            message="No questions match those filters."
          >
            <Button asChild>
              <Link href="/studio/qa" className="cursor-pointer">
                Clear filters
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={<Inbox className="size-6" />}
            title="Inbox is empty"
            message="When learners ask questions on your courses, they show up here."
          />
        )
      ) : (
        <div className="flex flex-col gap-2">
          {pager}
          <ol className="overflow-hidden rounded-lg border bg-card shadow-sm">
            {inbox.threads.map((thread) => (
              <li
                key={thread.id}
                className={cn(
                  "border-b last:border-b-0",
                  thread.answered ? "" : "border-l-4 border-l-warning",
                )}
              >
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                    {thread.answered ? (
                      <CircleCheck className="size-4 shrink-0 text-success" aria-label="Answered" />
                    ) : (
                      <MessageCircleQuestion
                        className="size-4 shrink-0 text-warning"
                        aria-label="Needs an answer"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{thread.title}</span>
                    {thread.answered ? (
                      <Badge variant="success">Answered</Badge>
                    ) : (
                      <Badge variant="warning">Needs answer</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {thread.courseTitle}
                      {thread.lectureTitle ? ` · ${thread.lectureTitle}` : " · course-wide"}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatDate(thread.createdAt)} · {thread.replyCount}{" "}
                      {thread.replyCount === 1 ? "reply" : "replies"}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-2 border-t px-3 py-3">
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{thread.body}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {thread.askedBy} ·{" "}
                      <Link
                        href={`/learn/${thread.courseSlug}` as Route}
                        className="cursor-pointer underline hover:text-foreground"
                      >
                        open in course
                      </Link>
                    </p>
                    <InboxReplyForm threadId={thread.id} title={thread.title} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
          {pager}
        </div>
      )}
    </main>
  );
}
