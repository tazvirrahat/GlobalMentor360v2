import Link from "next/link";
import { BookOpen, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CompactRating } from "@/components/site/star-rating";
import { courseLevelLabel, coursePriceLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type CourseCardData = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  level: string;
  ratingAverage: number;
  ratingCount: number;
  enrollmentCount: number;
  instructor: { name: string };
  primaryCategory: { name: string; slug: string } | null;
  totalDuration: string;
  lectureCount: number;
  price: { amount: number; currency: string } | null;
  isFree: boolean;
};

/** Brand-adjacent cover pairs (existing palette tokens only). */
const COVER_TONES = [
  "bg-linear-to-br from-primary-active to-primary",
  "bg-linear-to-br from-brand-ink to-primary",
  "bg-linear-to-br from-foreground to-primary-hover",
  "bg-linear-to-br from-primary-hover to-primary-active",
  "bg-linear-to-br from-brand-ink via-primary-active to-primary",
  "bg-linear-to-br from-primary to-brand-ink",
] as const;

function coverToneClass(slug: string) {
  let hash = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return COVER_TONES[(hash >>> 0) % COVER_TONES.length];
}

function initials(title: string) {
  const parts = title.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0] ?? "").join("");
  return (letters || title.slice(0, 2)).toUpperCase();
}

export function CourseCard({ course }: { course: CourseCardData }) {
  // isFree comes from lib/courses so the card, the landing page, and the
  // enrol-free action share one definition. A course with no active price is
  // not free — it is not for sale, which is a different thing entirely.
  const free = course.isFree;

  return (
    <Link href={`/courses/${course.slug}`} className="group block h-full cursor-pointer">
      <Card className="h-full gap-0 overflow-hidden rounded-lg py-0 transition-shadow duration-200 group-hover:shadow-brand">
        <div
          className={cn(
            "relative flex h-44 items-end overflow-hidden p-4",
            coverToneClass(course.slug),
          )}
        >
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-heading text-7xl font-semibold text-white/15"
            aria-hidden
          >
            {initials(course.title)}
          </span>
          <div className="relative z-10 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="bg-white/95 text-foreground">
              {courseLevelLabel(course.level)}
            </Badge>
            {course.primaryCategory ? (
              <Badge
                variant="secondary"
                className="max-w-40 truncate bg-white/95 text-foreground"
                title={course.primaryCategory.name}
              >
                {course.primaryCategory.name}
              </Badge>
            ) : null}
            {free ? (
              <Badge className="bg-accent text-accent-foreground">Free</Badge>
            ) : null}
          </div>
        </div>

        <CardContent className="flex flex-1 flex-col gap-2 p-5">
          <h3
            className="line-clamp-2 font-heading text-base font-semibold leading-snug tracking-tight group-hover:text-primary"
            title={course.title}
          >
            {course.title}
          </h3>
          {course.subtitle ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{course.subtitle}</p>
          ) : null}

          <p className="text-sm text-muted-foreground">{course.instructor.name}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {/* The denormalised copy, and the only surface entitled to it: the
                grid renders one of these per course, so an aggregate query here
                is an aggregate query per card. Recomputed on every review write
                and stale in between — see lib/reviews.ts. */}
            {course.ratingCount > 0 ? (
              <CompactRating
                average={course.ratingAverage}
                count={course.ratingCount}
                className="text-star"
                starClassName="size-3.5"
                countClassName="text-muted-foreground"
              />
            ) : null}
            <span className="flex items-center gap-1">
              <BookOpen className="size-3.5" aria-hidden />
              {course.lectureCount} lectures
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {course.totalDuration}
            </span>
          </div>

          <div className="mt-auto flex items-end justify-between gap-3 pt-3">
            <span className="font-heading text-lg font-semibold tabular-nums text-primary">
              {coursePriceLabel(free, course.price)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
