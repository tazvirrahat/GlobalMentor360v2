import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ReactNode } from "react";

export type LearnTopBarProps = {
  course: { title: string; slug: string; enrolled: boolean; percent: number; done: number; total: number };
  next: { href: string; title: string } | null;
  /** The phone "Contents" sheet (a client component), rendered below lg. */
  contents: ReactNode;
};

/**
 * The player's own top bar: back, course title, progress, Contents (phones)
 * and Next lesson. No site navigation: the player is focus mode.
 */
export function LearnTopBar({ course, next, contents }: LearnTopBarProps) {
  const back = course.enrolled
    ? { href: "/dashboard", label: "My learning" }
    : { href: `/courses/${course.slug}`, label: "Course page" };

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-surface">
      <div className="flex h-14 items-center gap-2 pr-2 pl-1 sm:gap-3 sm:pr-4 sm:pl-2">
        <Link
          href={back.href as Route}
          aria-label={`Back to ${back.label}`}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-sm font-medium text-ink hover:bg-wash focus-ring"
        >
          <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
          <span className="hidden sm:inline" aria-hidden>
            {back.label}
          </span>
        </Link>

        <span aria-hidden className="hidden h-6 w-px bg-rule sm:block" />

        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={course.title}>
          {course.title}
        </p>

        {course.enrolled ? (
          <div className="hidden shrink-0 items-center gap-3 md:flex">
            <Progress
              value={course.percent}
              aria-label={`Course progress ${Math.floor(course.percent)}%`}
              className="w-32"
            />
            <span className="text-xs text-graphite tabular-nums">
              {course.done} of {course.total} done
            </span>
          </div>
        ) : null}

        {contents}

        {next ? (
          <Button asChild size="lg" className="shrink-0 px-3 sm:px-4">
            <Link href={next.href as Route} aria-label={`Next lesson: ${next.title}`}>
              <span aria-hidden className="hidden sm:inline">
                Next lesson
              </span>
              <span aria-hidden className="sm:hidden">
                Next
              </span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
