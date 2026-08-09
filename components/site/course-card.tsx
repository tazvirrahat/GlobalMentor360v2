import Link from "next/link";
import { BookOpen, Clock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/courses";

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

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

export function CourseCard({ course }: { course: CourseCardData }) {
  // isFree comes from lib/courses so the card, the landing page, and the
  // enrol-free action share one definition. A course with no active price is
  // not free — it is not for sale, which is a different thing entirely.
  const free = course.isFree;

  return (
    <Link href={`/courses/${course.slug}`} className="group block h-full">
      <Card className="h-full gap-0 overflow-hidden rounded-2xl py-0 transition-shadow group-hover:shadow-brand">
        {/* Cover placeholder until MediaAsset thumbnails land — brand gradient with initials. */}
        <div className="relative flex h-36 items-end bg-hero-gradient p-4">
          <span className="text-3xl font-extrabold text-white/25" aria-hidden>
            {course.title.slice(0, 2).toUpperCase()}
          </span>
          <div className="absolute right-3 top-3 flex gap-1.5">
            {free ? <Badge className="bg-brand-pink text-white">Free</Badge> : null}
            {course.primaryCategory ? (
              <Badge variant="secondary" className="bg-white/90 text-brand-ink">
                {course.primaryCategory.name}
              </Badge>
            ) : null}
          </div>
        </div>

        <CardContent className="flex flex-col gap-2 p-4">
          <h3 className="line-clamp-2 font-bold leading-snug group-hover:text-brand">
            {course.title}
          </h3>
          {course.subtitle ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{course.subtitle}</p>
          ) : null}

          <p className="text-xs text-muted-foreground">{course.instructor.name}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {course.ratingCount > 0 ? (
              <span className="flex items-center gap-1 font-semibold text-amber-600">
                <Star className="size-3.5 fill-current" aria-hidden />
                {course.ratingAverage.toFixed(1)}
                <span className="font-normal text-muted-foreground">({course.ratingCount})</span>
              </span>
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

          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="text-lg font-extrabold text-brand">
              {free
                ? "Free"
                : course.price
                  ? formatPrice(course.price.amount, course.price.currency)
                  : "Not for sale"}
            </span>
            <span className="text-xs text-muted-foreground">{LEVEL_LABEL[course.level] ?? course.level}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
