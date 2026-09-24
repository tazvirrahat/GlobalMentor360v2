import { Badge } from "@/components/ui/badge";
import { PageNav } from "@/components/site/page-nav";
import { formatDateMedium } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { earlierRepliesCopy, THREAD_PAGE_SIZE, type QaPanel as QaPanelData, type QaThread } from "@/lib/qa";
import { AskQuestionForm } from "./ask-question-form";
import { ReplyForm } from "./reply-form";

function Thread({ thread }: { thread: QaThread }) {
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{thread.title}</h3>
          {thread.scope === "COURSE" ? <Badge variant="outline">Whole course</Badge> : null}
        </div>
        <p className="flex flex-wrap gap-x-3 text-sm text-graphite">
          <span>{thread.authorName}</span>
          <time dateTime={thread.createdAt.toISOString()}>{formatDateMedium(thread.createdAt)}</time>
        </p>
      </div>

      {/* Rendered as text, never as markup — same as every other learner-written
          field in this codebase. */}
      <p className="text-base whitespace-pre-line text-ink">{thread.body}</p>

      {thread.replies.length > 0 ? (
        <ul className="flex flex-col gap-4 border-l-2 border-rule pl-4">
          {earlierRepliesCopy(thread.earlierReplyCount) ? (
            <li className="text-sm text-graphite">{earlierRepliesCopy(thread.earlierReplyCount)}</li>
          ) : null}
          {thread.replies.map((reply) => (
            <li key={reply.id} className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-graphite">
                <span className="font-semibold text-ink">{reply.authorName}</span>
                {/* Attribution of one answer, not the P1 "answered by
                    instructor" thread badge, which sorts and filters the list. */}
                {reply.isInstructor ? <Badge variant="outline">Instructor</Badge> : null}
                <time dateTime={reply.createdAt.toISOString()}>{formatDateMedium(reply.createdAt)}</time>
              </p>
              <p className="text-base whitespace-pre-line text-ink">{reply.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="group text-sm">
        <summary className="inline-flex min-h-8 w-fit cursor-pointer list-none items-center rounded-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring [&::-webkit-details-marker]:hidden">
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
export function QaPanel({
  courseId,
  curriculumItemId,
  lectureTitle,
  slug,
  panel,
  params,
}: {
  courseId: string;
  curriculumItemId: string;
  lectureTitle: string;
  slug: string;
  /** From getCourseQaPanel, loaded by the page (which also needs the count). */
  panel: QaPanelData;
  params?: Record<string, string | undefined>;
}) {
  const { threads, total, page, pageCount } = panel;
  const range = showingRange(page, THREAD_PAGE_SIZE, total);

  return (
    <section aria-labelledby="qa-heading" className="flex flex-col gap-5">
      <h2 id="qa-heading" className="sr-only">
        Questions and answers
      </h2>

      <AskQuestionForm
        courseId={courseId}
        curriculumItemId={curriculumItemId}
        lectureTitle={lectureTitle}
      />

      {threads.length === 0 ? (
        <p className="text-graphite">No questions here yet. Yours would be the first.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {threads.map((thread) => (
            <Thread key={thread.id} thread={thread} />
          ))}
        </ul>
      )}

      {total > THREAD_PAGE_SIZE ? (
        <p className="text-sm text-graphite">
          Showing {range.from} to {range.to} of {total}
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
