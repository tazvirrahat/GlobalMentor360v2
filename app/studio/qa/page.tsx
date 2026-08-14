import type { Metadata, Route } from "next";
import Link from "next/link";
import { CircleCheck, MessageCircleQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getInboxCourseFilters, getInstructorInbox } from "@/lib/qa";
import { requireRole } from "@/lib/session";
import { InboxReplyForm } from "./inbox-reply-form";

export const metadata: Metadata = { title: "Q&A · Studio" };
export const dynamic = "force-dynamic";

type Params = {
  searchParams: Promise<{ course?: string; unanswered?: string; since?: string; page?: string }>;
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
 * Filters are links carrying searchParams, not client state.
 *
 * That keeps the page a Server Component, makes every filtered view a URL an
 * instructor can bookmark or share with a co-author, and means the list works
 * with JavaScript unavailable. The only client island is the reply form.
 */
function buildHref(
  current: { course?: string; unanswered?: string; since?: string },
  patch: Partial<{ course: string; unanswered: string; since: string }>,
): Route {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.course) params.set("course", next.course);
  if (next.unanswered) params.set("unanswered", next.unanswered);
  if (next.since) params.set("since", next.since);
  const query = params.toString();
  return (query ? `/studio/qa?${query}` : "/studio/qa") as Route;
}

export default async function StudioQaPage({ searchParams }: Params) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const query = await searchParams;

  const unansweredOnly = query.unanswered === "1";
  const [inbox, courses] = await Promise.all([
    getInstructorInbox(user.id, {
      courseId: query.course || undefined,
      unansweredOnly,
      since: sinceDate(query.since),
      page: Number(query.page) || 1,
    }),
    getInboxCourseFilters(user.id),
  ]);

  const totalUnanswered = courses.reduce((sum, course) => sum + course.unanswered, 0);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Questions</h1>
        <p className="mt-1 text-muted-foreground">
          {totalUnanswered === 0
            ? "Everything has an answer from you."
            : `${totalUnanswered} ${totalUnanswered === 1 ? "question is" : "questions are"} waiting on you.`}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Show</span>
          <Button asChild size="sm" variant={unansweredOnly ? "default" : "outline"}>
            <Link href={buildHref(query, { unanswered: unansweredOnly ? "" : "1" })}>
              Needs my answer
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Course</span>
          <Button asChild size="sm" variant={query.course ? "outline" : "default"}>
            <Link href={buildHref(query, { course: "" })}>All</Link>
          </Button>
          {courses.map((course) => (
            <Button
              key={course.id}
              asChild
              size="sm"
              variant={query.course === course.id ? "default" : "outline"}
            >
              <Link href={buildHref(query, { course: course.id })}>
                {course.title}
                {course.unanswered > 0 ? (
                  <Badge variant="secondary" className="ml-1.5">
                    {course.unanswered}
                  </Badge>
                ) : null}
              </Link>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Asked</span>
          {SINCE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              asChild
              size="sm"
              variant={(query.since ?? "") === option.value ? "default" : "outline"}
            >
              <Link href={buildHref(query, { since: option.value })}>{option.label}</Link>
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
                    {thread.askedBy} · {thread.createdAt.toLocaleDateString("en-GB")} ·{" "}
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

      {inbox.pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-2">
          {Array.from({ length: inbox.pageCount }, (_, index) => index + 1).map((page) => (
            <Button
              key={page}
              asChild
              size="sm"
              variant={page === inbox.page ? "default" : "outline"}
            >
              <Link
                href={
                  `${buildHref(query, {})}${buildHref(query, {}).includes("?") ? "&" : "?"}page=${page}` as Route
                }
              >
                {page}
              </Link>
            </Button>
          ))}
        </nav>
      ) : null}
    </main>
  );
}
