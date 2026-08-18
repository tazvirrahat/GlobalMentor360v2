import { Badge } from "@/components/ui/badge";
import { formatDateMedium } from "@/lib/format";
import { getCourseQaPanel, earlierRepliesCopy, type QaThread } from "@/lib/qa";
import { getCurrentUser } from "@/lib/session";
import { AskQuestionForm } from "./ask-question-form";
import { ReplyForm } from "./reply-form";

function Thread({ thread }: { thread: QaThread }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{thread.title}</h3>
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
                  <span className="ml-2 font-semibold text-brand">Instructor</span>
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
}: {
  courseId: string;
  curriculumItemId: string;
  lectureTitle: string;
}) {
  const user = await getCurrentUser();
  const { threads, hiddenByPageSize } = user
    ? await getCourseQaPanel(courseId, curriculumItemId, user.id)
    : { threads: [], hiddenByPageSize: 0 };

  return (
    <section aria-labelledby="qa-heading" className="flex flex-col gap-4">
      <h2 id="qa-heading" className="text-lg font-extrabold tracking-tight">
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

      {hiddenByPageSize > 0 ? (
        <p className="text-sm text-muted-foreground">
          Showing the {threads.length} most recent of {threads.length + hiddenByPageSize} questions.
        </p>
      ) : null}
    </section>
  );
}
