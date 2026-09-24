import type { Route } from "next";
import Link from "next/link";
import { CompactRating } from "@/components/site/star-rating";
import { courseLevelLabel } from "@/lib/labels";
import { CoverMark } from "./cover-mark";
import { CoursePrice } from "./price";

export type CourseRowData = {
  title: string;
  slug: string;
  subtitle: string | null;
  level: string;
  ratingAverage: number;
  ratingCount: number;
  instructor: { name: string };
  totalDuration: string;
  lectureCount: number;
  price: { amount: number; currency: string } | null;
  isFree: boolean;
};

/**
 * A course in a list (catalog, home): cover mark, title, one line of subtitle,
 * instructor, the facts, and the price on the right. The whole row is one link:
 * the title's link stretches over the row with ::after, and that pseudo-element
 * draws the focus outline, so the indicator surrounds what you would click.
 */
export function CourseRow({
  course,
  headingLevel = 3,
}: {
  course: CourseRowData;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const lessons = `${course.lectureCount} ${course.lectureCount === 1 ? "lesson" : "lessons"}`;

  return (
    <article className="relative flex gap-4 rounded-md px-2 py-4 hover:bg-wash/70 sm:gap-5 sm:py-5">
      <CoverMark title={course.title} slug={course.slug} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Heading className="text-base leading-snug font-semibold text-ink">
            <Link
              href={`/courses/${course.slug}` as Route}
              className="outline-none after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ink focus-visible:after:outline-solid"
            >
              {course.title}
            </Link>
          </Heading>
          {course.subtitle ? <p className="line-clamp-1 text-sm text-graphite">{course.subtitle}</p> : null}
          <p className="text-sm text-ink">{course.instructor.name}</p>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-graphite">
            {course.ratingCount > 0 ? (
              <li>
                <CompactRating
                  average={course.ratingAverage}
                  count={course.ratingCount}
                  className="text-ink"
                  starClassName="size-3.5 text-ink"
                  countClassName="text-graphite"
                />
              </li>
            ) : null}
            <li>{lessons}</li>
            <li>{course.totalDuration}</li>
            <li>{courseLevelLabel(course.level)}</li>
          </ul>
        </div>
        <CoursePrice isFree={course.isFree} price={course.price} className="text-base sm:text-right" />
      </div>
    </article>
  );
}
