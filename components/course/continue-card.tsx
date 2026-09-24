import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ContinueLearning } from "@/lib/continue-learning";
import { CourseModule } from "./course-module";

/**
 * "Continue learning": the course, how far along it is, the lessons around
 * the learner's place (their next lesson on the highlighter), and Resume.
 */
export function ContinueCard({
  data,
  headingLevel = 2,
  heading = "Continue learning",
}: {
  data: ContinueLearning;
  headingLevel?: 2 | 3;
  heading?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const { course } = data;

  return (
    <section aria-labelledby="continue-heading" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5">
      <div className="flex flex-col gap-1">
        <Heading id="continue-heading" className="text-sm font-semibold text-graphite">
          {heading}
        </Heading>
        <p className="text-lg leading-snug font-semibold text-ink">
          <Link
            href={`/learn/${course.slug}` as Route}
            className="rounded-sm hover:underline hover:decoration-control hover:underline-offset-4 focus-ring"
          >
            {course.title}
          </Link>
        </p>
        <div className="flex items-center gap-3">
          <Progress value={course.percent} aria-label={`Course progress ${course.percent}%`} className="h-1.5 flex-1" />
          <span className="shrink-0 text-xs text-graphite">
            {course.done} of {course.total} lessons done
          </span>
        </div>
      </div>
      <CourseModule variant="compact" sections={data.sections} currentId={data.currentId} />
      <Button asChild size="lg" className="w-full sm:w-fit">
        <Link href={`/learn/${course.slug}/${data.currentId}` as Route} aria-label={`Resume ${course.title}`}>
          Resume
        </Link>
      </Button>
    </section>
  );
}
