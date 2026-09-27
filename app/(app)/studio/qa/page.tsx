import type { Metadata, Route } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/site/empty-state";
import { getInboxCourseFilters, getInstructorInbox, INBOX_PAGE_SIZE } from "@/lib/qa";
import { formatDateMedium } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { requireRole } from "@/lib/session";
import { cn } from "@/lib/utils";
import { InboxReplyForm } from "./inbox-reply-form";
import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { getViewerTimeZone } from "@/lib/viewer-time";

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
  const timeZone = await getViewerTimeZone();
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

  const filterLink = (active: boolean) =>
    cn(
      "inline-flex min-h-8 items-center rounded-md border px-3 text-sm font-medium focus-ring",
      active ? "border-ink bg-ink text-surface" : "border-control bg-surface text-ink hover:bg-wash",
    );

  return (
    <main className="flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Questions"
        description={
          unansweredTotal === 0
            ? "Every question has an answer from you."
            : `${unansweredTotal} ${unansweredTotal === 1 ? "question is" : "questions are"} waiting for your answer.`
        }
      />

      <div className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-sm font-medium text-graphite">Show</span>
          <Link
            href={buildHref(filters, { unanswered: "" })}
            aria-current={unansweredOnly ? undefined : "page"}
            className={filterLink(!unansweredOnly)}
          >
            All questions
          </Link>
          <Link
            href={buildHref(filters, { unanswered: "1" })}
            aria-current={unansweredOnly ? "page" : undefined}
            className={filterLink(unansweredOnly)}
          >
            Needs my answer
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-sm font-medium text-graphite">Asked</span>
          {SINCE_OPTIONS.map((option) => {
            const active = (query.since ?? "") === option.value;
            return (
              <Link
                key={option.value}
                href={buildHref(filters, { since: option.value })}
                aria-current={active ? "page" : undefined}
                className={filterLink(active)}
              >
                {option.label}
              </Link>
            );
          })}
        </div>

        <form action="/studio/qa" method="get" className="flex flex-col gap-1.5">
          <label htmlFor="courseId" className="text-sm font-medium text-graphite">
            Course
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="courseId"
              name="courseId"
              defaultValue={courseId ?? ""}
              className="h-10 min-w-0 flex-1 cursor-pointer rounded-md border border-input bg-surface px-3 text-sm text-ink focus-ring sm:max-w-md"
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.unanswered > 0 ? `${course.title} (${course.unanswered} waiting)` : course.title}
                </option>
              ))}
            </select>
            {unansweredOnly ? <input type="hidden" name="unanswered" value="1" /> : null}
            {query.since ? <input type="hidden" name="since" value={query.since} /> : null}
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </div>
          {courseTotal > courses.length ? (
            <p className="text-sm text-graphite">
              Showing {courses.length} of {courseTotal} courses, ordered by title.
            </p>
          ) : null}
        </form>
      </div>

      {inbox.threads.length === 0 ? (
        filtered ? (
          <EmptyState title="No questions match" message="Nothing matches those filters.">
            <Button asChild variant="secondary">
              <Link href="/studio/qa">Clear filters</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            title="No questions yet"
            message="When learners ask about your courses, their questions appear here."
          />
        )
      ) : (
        <>
          <ol className="flex flex-col divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-surface">
            {inbox.threads.map((thread) => (
              <li key={thread.id} className={cn(!thread.answered && "border-l-4 border-l-caution")}>
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none flex-col gap-1 px-4 py-3 hover:bg-wash/60 focus-ring-inset [&::-webkit-details-marker]:hidden">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1 font-medium text-ink">{thread.title}</span>
                      {thread.answered ? (
                        <Badge variant="success">Answered</Badge>
                      ) : (
                        <Badge variant="warning">Needs your answer</Badge>
                      )}
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-graphite">
                      <span>{thread.courseTitle}</span>
                      <span>{thread.lectureTitle ?? "About the whole course"}</span>
                      <span>
                        <time dateTime={thread.createdAt.toISOString()}>{formatDateMedium(thread.createdAt, timeZone)}</time>
                      </span>
                      <span>
                        {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
                      </span>
                    </span>
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-rule px-4 py-4">
                    <p className="text-sm text-graphite">
                      Asked by <span className="font-medium text-ink">{thread.askedBy}</span>
                    </p>
                    <p className="max-w-[68ch] whitespace-pre-line text-ink">{thread.body}</p>
                    <Link
                      href={`/learn/${thread.courseSlug}?tab=qa` as Route}
                      className="inline-flex min-h-8 w-fit items-center rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                    >
                      Open in the course
                    </Link>
                    <InboxReplyForm threadId={thread.id} title={thread.title} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
          <ListFooter
            range={range}
            total={inbox.total}
            pathname="/studio/qa"
            params={{ courseId, unanswered: query.unanswered, since: query.since }}
            page={inbox.page}
            pageCount={inbox.pageCount}
          />
        </>
      )}
    </main>
  );
}
