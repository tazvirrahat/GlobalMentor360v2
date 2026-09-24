import type { ReactNode } from "react";
import { CurriculumList, type CurriculumSection } from "./curriculum-list";
import { CurriculumSheet } from "./curriculum-sheet";
import { LearnRail } from "./learn-rail";
import { LearnTopBar } from "./learn-top-bar";

export type LearnShellProps = {
  course: {
    title: string;
    slug: string;
    enrolled: boolean;
    percent: number;
    done: number;
    total: number;
    sections: CurriculumSection[];
  };
  currentId: string;
  /** Only when the next lesson is already open to this learner. */
  next: { href: string; title: string } | null;
  children: ReactNode;
};

/**
 * Focus mode for the player (spec §5): its own top bar, the curriculum as a
 * rail on desktop and a sheet on phones, and the lesson first. No site header
 * or footer.
 */
export function LearnShell({ course, currentId, next, children }: LearnShellProps) {
  const list = (prefix: string) => (
    <CurriculumList sections={course.sections} slug={course.slug} currentId={currentId} idPrefix={prefix} />
  );

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to lesson
      </a>
      <LearnTopBar course={course} next={next} contents={<CurriculumSheet>{list("sheet")}</CurriculumSheet>} />
      <div className="flex min-w-0 flex-1">
        <LearnRail>{list("rail")}</LearnRail>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
