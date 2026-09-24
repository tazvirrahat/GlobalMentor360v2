import type { Route } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Circle, FileQuestion, FileText, Lock, PlayCircle } from "lucide-react";
import {
  compactWindow,
  isGate,
  isQuizType,
  rowState,
  sectionMinutes,
  type ModuleRow,
  type ModuleSection,
  type RowState,
} from "@/lib/course-module";
import { formatLessonMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

export type { ModuleRow, ModuleSection } from "@/lib/course-module";

type PlayerProps = {
  variant: "player";
  sections: ModuleSection[];
  slug: string;
  currentId: string;
  /** The rail and the phone sheet can both be in the DOM; keep their ids apart. */
  idPrefix?: string;
};

type OutlineProps = {
  variant: "outline";
  sections: ModuleSection[];
  slug: string;
  /** Rows this visitor may open: free previews, plus unlocked lessons for an enrolled learner. */
  playableIds?: string[];
  /** Sections open on first render; defaults to the first one. */
  openSectionIds?: string[];
};

type CompactProps = {
  variant: "compact";
  sections: ModuleSection[];
  currentId: string;
  size?: number;
};

/**
 * A course's lessons, the same way everywhere (spec §7): done rows get the
 * verified tick, the learner's current lesson sits on the highlighter band (the
 * only use of --mark), locked rows are graphite with a lock, and a quiz that
 * gates the next lessons says so.
 */
export function CourseModule(props: PlayerProps | OutlineProps | CompactProps) {
  if (props.variant === "player") return <PlayerModule {...props} />;
  if (props.variant === "outline") return <OutlineModule {...props} />;
  return <CompactModule {...props} />;
}

function Duration({ row }: { row: ModuleRow }) {
  if (row.durationSeconds) {
    return (
      <span className="mt-0.5 shrink-0 text-xs text-graphite tabular-nums">
        {formatLessonMinutes(row.durationSeconds)}
      </span>
    );
  }
  if (isQuizType(row.type)) return <span className="mt-0.5 shrink-0 text-xs text-graphite">Quiz</span>;
  return null;
}

function StateIcon({ row, state }: { row: ModuleRow; state: RowState }) {
  const cls = "mt-0.5 size-4 shrink-0";
  if (state === "locked") return <Lock className={cn(cls, "text-graphite")} strokeWidth={1.75} aria-hidden />;
  if (row.completed) return <CheckCircle2 className={cn(cls, "text-verified")} strokeWidth={2} aria-hidden />;
  if (isQuizType(row.type)) return <FileQuestion className={cn(cls, "text-ink")} strokeWidth={1.75} aria-hidden />;
  return <Circle className={cn(cls, "text-graphite")} strokeWidth={1.75} aria-hidden />;
}

function stateWords(row: ModuleRow, state: RowState) {
  return [
    state === "locked" ? "locked" : row.completed ? "completed" : null,
    row.isPreview ? "free preview" : null,
  ]
    .filter(Boolean)
    .map((word) => `, ${word}`)
    .join("");
}

function PlayerModule({ sections, slug, currentId, idPrefix = "rail" }: PlayerProps) {
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
                const gate = isGate(flat, flat.indexOf(row));
                const body = (
                  <>
                    <StateIcon row={row} state={state} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("text-sm", state === "current" ? "font-semibold" : "font-normal")}>
                        {row.title}
                      </span>
                      {gate ? (
                        <span className="text-xs text-graphite">Pass this quiz to open the next lessons</span>
                      ) : null}
                      <span className="sr-only">{stateWords(row, state)}</span>
                    </span>
                    <Duration row={row} />
                  </>
                );
                const rowClass = "flex min-h-11 items-start gap-3 px-4 py-2.5";
                return (
                  <li key={row.id}>
                    {state === "locked" ? (
                      <span aria-disabled="true" data-state="locked" className={cn(rowClass, "cursor-not-allowed text-graphite")}>
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

function OutlineIcon({ row }: { row: ModuleRow }) {
  const cls = "mt-0.5 size-4 shrink-0";
  if (row.completed) return <CheckCircle2 className={cn(cls, "text-verified")} strokeWidth={2} aria-hidden />;
  if (isQuizType(row.type)) return <FileQuestion className={cn(cls, "text-graphite")} strokeWidth={1.75} aria-hidden />;
  if (row.contentType === "ARTICLE") return <FileText className={cn(cls, "text-graphite")} strokeWidth={1.75} aria-hidden />;
  return <PlayCircle className={cn(cls, "text-graphite")} strokeWidth={1.75} aria-hidden />;
}

function OutlineModule({ sections, slug, playableIds = [], openSectionIds }: OutlineProps) {
  const playable = new Set(playableIds);
  const open = new Set(openSectionIds ?? (sections[0] ? [sections[0].id] : []));

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-rule bg-surface">
      {sections.map((section, sectionIndex) => {
        const minutes = sectionMinutes(section);
        const quizzes = section.items.filter((item) => isQuizType(item.type)).length;
        const lectures = section.items.length - quizzes;
        const counts = [
          lectures > 0 ? `${lectures} ${lectures === 1 ? "lesson" : "lessons"}` : null,
          quizzes > 0 ? `${quizzes} ${quizzes === 1 ? "quiz" : "quizzes"}` : null,
          minutes > 0 ? `${minutes} min` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <details
            key={section.id}
            open={open.has(section.id)}
            className="group border-rule [&:not(:first-child)]:border-t"
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-wash focus-ring-inset [&::-webkit-details-marker]:hidden">
              <ChevronDown
                className="size-4 shrink-0 text-graphite transition-transform duration-150 group-open:rotate-180"
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-base font-semibold text-ink">
                <span className="sr-only">Section {sectionIndex + 1}: </span>
                {section.title}
              </span>
              <span className="shrink-0 text-sm text-graphite">{counts}</span>
            </summary>
            <ol className="flex flex-col border-t border-rule py-1">
              {section.items.map((row) => {
                const canOpen = playable.has(row.id);
                return (
                  <li key={row.id} className="flex min-h-11 items-start gap-3 px-4 py-2.5 text-sm">
                    <OutlineIcon row={row} />
                    <span className="min-w-0 flex-1 text-ink">
                      {canOpen && !row.isPreview ? (
                        <Link
                          href={`/learn/${slug}/${row.id}` as Route}
                          className="rounded-sm underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                        >
                          {row.title}
                        </Link>
                      ) : (
                        row.title
                      )}
                      {row.completed ? <span className="sr-only">, completed</span> : null}
                    </span>
                    {row.isPreview && canOpen ? (
                      <Link
                        href={`/learn/${slug}/${row.id}` as Route}
                        aria-label={`Preview: ${row.title}`}
                        className="-my-1 inline-flex min-h-8 shrink-0 items-center rounded-md px-2 text-sm font-semibold text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                      >
                        Preview
                      </Link>
                    ) : null}
                    <Duration row={row} />
                  </li>
                );
              })}
            </ol>
          </details>
        );
      })}
    </div>
  );
}

function CompactModule({ sections, currentId, size = 4 }: CompactProps) {
  const window = compactWindow(sections, currentId, size);
  if (!window) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-graphite">
        Section {window.sectionIndex + 1}: {window.section.title}
      </p>
      <ol className="flex flex-col overflow-hidden rounded-md border border-rule bg-surface">
        {window.rows.map((row) => {
          const state = rowState(row, currentId);
          return (
            <li
              key={row.id}
              className={cn(
                "relative flex min-h-10 items-start gap-3 px-3 py-2 text-sm [&:not(:first-child)]:border-t [&:not(:first-child)]:border-rule",
                state === "current" &&
                  "bg-mark font-semibold text-ink before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ink",
                state === "locked" && "text-graphite",
              )}
            >
              <StateIcon row={row} state={state} />
              <span className="min-w-0 flex-1">
                {row.title}
                <span className="sr-only">{state === "current" ? ", up next" : stateWords(row, state)}</span>
              </span>
              <Duration row={row} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
