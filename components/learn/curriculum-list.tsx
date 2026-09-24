import type { Route } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, FileQuestion, Lock } from "lucide-react";
import { formatLessonMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CurriculumRow = {
  id: string;
  title: string;
  type: string;
  isPreview: boolean;
  locked: boolean;
  completed: boolean;
  durationSeconds: number | null;
};

export type CurriculumSection = { id: string; title: string; items: CurriculumRow[] };

export type RowState = "current" | "done" | "open" | "locked";

export function rowState(row: CurriculumRow, currentId: string): RowState {
  if (row.id === currentId) return "current";
  if (row.locked) return "locked";
  if (row.completed) return "done";
  return "open";
}

const isQuiz = (row: CurriculumRow) => row.type === "QUIZ" || row.type === "PRACTICE_TEST";

function RowIcon({ row, state }: { row: CurriculumRow; state: RowState }) {
  const cls = "mt-0.5 size-4 shrink-0";
  if (state === "locked") return <Lock className={cn(cls, "text-graphite")} strokeWidth={1.75} aria-hidden />;
  if (row.completed) return <CheckCircle2 className={cn(cls, "text-verified")} strokeWidth={2} aria-hidden />;
  if (isQuiz(row)) return <FileQuestion className={cn(cls, "text-ink")} strokeWidth={1.75} aria-hidden />;
  return <Circle className={cn(cls, "text-graphite")} strokeWidth={1.75} aria-hidden />;
}

/**
 * The course's lessons with the learner's position in them: done (green tick),
 * current (the highlighter band, the only place --mark appears in the player),
 * open, and locked. Used in the player's desktop rail and its phone sheet.
 */
export function CurriculumList({
  sections,
  slug,
  currentId,
  idPrefix = "rail",
}: {
  sections: CurriculumSection[];
  slug: string;
  currentId: string;
  /** The rail and the phone sheet can both be in the DOM; keep their ids apart. */
  idPrefix?: string;
}) {
  const flat = sections.flatMap((section) => section.items);

  return (
    <nav aria-label="Curriculum" className="flex flex-col gap-5 py-4">
      {sections.map((section, sectionIndex) => {
        const done = section.items.filter((item) => item.completed).length;
        const headingId = `${idPrefix}-section-${section.id}`;
        return (
          <section key={section.id} aria-labelledby={headingId} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 px-4">
              <h2 id={headingId} className="text-sm font-semibold text-ink">
                <span className="sr-only">Section {sectionIndex + 1}: </span>
                {section.title}
              </h2>
              <span className="shrink-0 text-xs text-graphite tabular-nums">
                {done} of {section.items.length}
              </span>
            </div>
            <ol className="flex flex-col">
              {section.items.map((row) => {
                const state = rowState(row, currentId);
                const index = flat.findIndex((item) => item.id === row.id);
                const gatesLaterLessons =
                  isQuiz(row) && !row.completed && !row.locked && flat.slice(index + 1).some((item) => item.locked);

                const body = (
                  <>
                    <RowIcon row={row} state={state} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("text-sm", state === "current" ? "font-semibold" : "font-normal")}>
                        {row.title}
                      </span>
                      {gatesLaterLessons ? (
                        <span className="text-xs text-graphite">Pass this quiz to open the next lessons</span>
                      ) : null}
                      <span className="sr-only">
                        {state === "locked" ? ", locked" : row.completed ? ", completed" : ""}
                        {row.isPreview ? ", free preview" : ""}
                      </span>
                    </span>
                    {row.durationSeconds ? (
                      <span className="mt-0.5 shrink-0 text-xs text-graphite tabular-nums">
                        {formatLessonMinutes(row.durationSeconds)}
                      </span>
                    ) : isQuiz(row) ? (
                      <span className="mt-0.5 shrink-0 text-xs text-graphite">Quiz</span>
                    ) : null}
                  </>
                );

                const rowClass = "flex min-h-11 items-start gap-3 px-4 py-2.5";
                return (
                  <li key={row.id}>
                    {state === "locked" ? (
                      <span
                        aria-disabled="true"
                        data-state="locked"
                        className={cn(rowClass, "cursor-not-allowed text-graphite")}
                      >
                        {body}
                      </span>
                    ) : (
                      <Link
                        href={`/learn/${slug}/${row.id}` as Route}
                        aria-current={state === "current" ? "page" : undefined}
                        data-state={state}
                        className={cn(
                          rowClass,
                          "relative text-ink focus-ring-inset",
                          state === "current"
                            ? "bg-mark before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ink"
                            : "hover:bg-wash",
                        )}
                      >
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </nav>
  );
}
