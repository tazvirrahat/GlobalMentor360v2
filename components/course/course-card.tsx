import type { Route } from "next";
import Link from "next/link";
import { CompactRating } from "@/components/site/star-rating";
import { Badge } from "@/components/ui/badge";
import { courseImageUrl } from "@/lib/course-image";
import { courseLevelLabel } from "@/lib/labels";
import { CourseCover } from "./course-cover";
import { CoursePrice } from "./price";
import type { CourseRowData } from "./course-row";

export type CourseCardData = CourseRowData & {
  id: string;
  primaryCategory?: { name: string; slug: string } | null;
};

/**
 * A course as a storefront card (home page): thumbnail, title, instructor,
 * rating, facts and price. One link; the title's link stretches over the card
 * and draws the focus outline around all of it.
 */
export function CourseCard({
  course,
  badge,
  headingLevel = 3,
}: {
  course: CourseCardData;
  badge?: "Most popular" | "Top rated" | "New" | null;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="group relative flex h-full flex-col gap-3">
      <CourseCover
        title={course.title}
        slug={course.slug}
        categorySlug={course.primaryCategory?.slug}
        categoryName={course.primaryCategory?.name}
        imageUrl={courseImageUrl(course.id, course.thumbnailUrl)}
        className="transition-opacity group-hover:opacity-90"
      />
      <div className="flex flex-1 flex-col gap-1">
        <Heading className="line-clamp-2 text-base leading-snug font-bold text-ink">
          <Link
            href={`/courses/${course.slug}` as Route}
            className="outline-none after:absolute after:-inset-2 after:rounded-lg after:content-[''] group-hover:underline group-hover:decoration-control group-hover:underline-offset-4 focus-visible:after:outline-2 focus-visible:after:outline-ink focus-visible:after:outline-solid"
          >
            {course.title}
          </Link>
        </Heading>
        <p className="text-sm text-graphite">{course.instructor.name}</p>
        {course.ratingCount > 0 ? (
          <CompactRating
            average={course.ratingAverage}
            count={course.ratingCount}
            className="text-sm text-ink"
            starClassName="size-3.5 text-ink"
            countClassName="font-normal text-graphite"
          />
        ) : (
          <p className="text-sm text-graphite">New course</p>
        )}
        <p className="text-xs text-graphite">
          {course.lectureCount} lessons, {course.totalDuration}, {courseLevelLabel(course.level).toLowerCase()}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-1">
          <CoursePrice isFree={course.isFree} price={course.price} className="text-base" />
          {badge ? <Badge variant={badge === "New" ? "outline" : "current"}>{badge}</Badge> : null}
        </div>
      </div>
    </article>
  );
}
