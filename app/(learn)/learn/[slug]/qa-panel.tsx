import { Badge } from "@/components/ui/badge";
import { PageNav } from "@/components/site/page-nav";
import { formatDateMedium } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { getCourseQaPanel, earlierRepliesCopy, THREAD_PAGE_SIZE, type QaThread } from "@/lib/qa";
import { getCurrentUser } from "@/lib/session";
import { AskQuestionForm } from "./ask-question-form";
import { ReplyForm } from "./reply-form";

function Thread({ thread }: { thread: QaThread }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading font-semibold tracking-tight">{thread.title}</h3>
          {thread.scope === "COURSE" ? <Badge variant="secondary">Whole course</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {thread.authorName} ·{" "}
          <time dateTime={thread.createdAt.toISOString()}>
            {formatDateMedium(thread.createdAt)}
          </time>
        </p>
      </div>

      {/* Rendered as text, never as markup — same as every other learner-written
          field in this codebase. */}
      <p className="whitespace-pre-line text-sm leading-relaxed">{thread.body}</p>

      {thread.replies.length > 0 ? (
        <ul className="flex flex-col gap-3 border-l pl-4">
          {earlierRepliesCopy(thread.earlierReplyCount) ? (
            <li className="text-xs text-muted-foreground">
              {earlierRepliesCopy(thread.earlierReplyCount)}
            </li>
          ) : null}
          {thread.replies.map((reply) => (
            <li key={reply.id} className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{reply.authorName}</span>
                {/* Attribution of one answer, not the P1 "answered by
                    instructor" thread badge, which sorts and filters the list. */}
                {reply.isInstructor ? (
                  <Badge variant="secondary" className="ml-2">
                    Instructor
                  </Badge>
                ) : null}{" "}
                ·{" "}
                <time dateTime={reply.createdAt.toISOString()}>
                  {formatDateMedium(reply.createdAt)}
                </time>
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed">{reply.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="text-sm">
        <summary className="w-fit cursor-pointer font-medium text-muted-foreground hover:text-foreground">
          Reply
        </summary>
        <div className="mt-3">
          <ReplyForm threadId={thread.id} questionTitle={thread.title} />
        </div>
      </details>
    </li>
  );
}

/**
 * The Q&A section of the player: this lecture's threads plus the course-wide
 * ones, and the form to open a new one.
 *
 * Rendered only for enrolled learners. That is a display decision, not the
 * authorization — reads and writes both re-check entitlement in lib/qa.ts,
 * because a server function is reachable without ever loading this page.
 */
export async function QaPanel({
  courseId,
  curriculumItemId,
  lectureTitle,
  slug,
  page: rawPage,
  params,
}: {
  courseId: string;
  curriculumItemId: string;
  lectureTitle: string;
  slug: string;
  page?: string;
  params?: Record<string, string | undefined>;
}) {
  const user = await getCurrentUser();
  const panel = user
    ? await getCourseQaPanel(courseId, curriculumItemId, user.id, rawPage)
    : { threads: [], total: 0, page: 1, pageCount: 1 };
  const { threads, total, page, pageCount } = panel;
  const range = showingRange(page, THREAD_PAGE_SIZE, total);

  return (
    <section aria-labelledby="qa-heading" className="flex flex-col gap-4">
      <h2 id="qa-heading" className="font-heading text-lg font-semibold tracking-tight">
        Questions &amp; answers
      </h2>

      <AskQuestionForm
        courseId={courseId}
        curriculumItemId={curriculumItemId}
        lectureTitle={lectureTitle}
      />

      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No questions here yet. Yours would be the first.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {threads.map((thread) => (
            <Thread key={thread.id} thread={thread} />
          ))}
        </ul>
      )}

      {total > 0 ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          Showing {range.from}–{range.to} of {total}
        </p>
      ) : null}
      <PageNav
        pathname={`/learn/${slug}/${curriculumItemId}`}
        params={params}
        page={page}
        pageCount={pageCount}
        pageParam="qaPage"
      />
    </section>
  );
}
