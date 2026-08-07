import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CourseCard } from "@/components/site/course-card";
import { listCatalogCategories, listPublishedCourses } from "@/lib/courses";
import type { CourseLevel } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Courses",
  description: "Browse the course catalog.",
};

// Without this Next prerenders the catalog at build time, which breaks two ways:
// newly published courses never appear until a redeploy, and the build itself
// fails anywhere the database isn't reachable (CI). Revisit with `revalidate`
// once we want CDN caching — but a build-time snapshot is never right here.
export const dynamic = "force-dynamic";

const LEVELS: { value: CourseLevel; label: string }[] = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
  { value: "ALL_LEVELS", label: "All levels" },
];

const LEVEL_VALUES = new Set<string>(LEVELS.map((entry) => entry.value));

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Href for the catalog with some filters changed and empty ones dropped. */
function catalogHref(query: Record<string, string | undefined>) {
  const cleaned = Object.fromEntries(
    Object.entries(query).filter((pair): pair is [string, string] => Boolean(pair[1])),
  );
  return { pathname: "/courses" as const, query: cleaned };
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = first(params.q)?.trim() || undefined;
  const rawLevel = first(params.level);
  const level = rawLevel && LEVEL_VALUES.has(rawLevel) ? (rawLevel as CourseLevel) : undefined;
  const category = first(params.category) || undefined;

  const [courses, categories] = await Promise.all([
    listPublishedCourses({ query: q, level, categorySlug: category }),
    listCatalogCategories(),
  ]);

  const filtered = Boolean(q || level || category);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Courses</h1>
      <p className="mt-2 text-muted-foreground">
        {courses.length === 0
          ? filtered
            ? "No courses match your filters."
            : "No published courses yet — check back soon."
          : `${courses.length} course${courses.length === 1 ? "" : "s"}${filtered ? " found" : " to choose from"}.`}
      </p>

      {/* Search — GET form so results are linkable and back-button friendly. */}
      <form action="/courses" method="get" className="mt-6 flex max-w-xl gap-2" role="search">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search courses…"
            aria-label="Search courses"
            className="pl-9"
          />
        </div>
        {level ? <input type="hidden" name="level" value={level} /> : null}
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <Button type="submit">Search</Button>
      </form>

      {/* Level filter */}
      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-muted-foreground">Level:</span>
        <Link
          href={catalogHref({ q, category })}
          className={cn(
            "rounded-full border px-3 py-1 transition-colors hover:border-brand hover:text-brand",
            !level && "border-brand bg-brand text-primary-foreground hover:text-primary-foreground",
          )}
        >
          Any
        </Link>
        {LEVELS.map((entry) => (
          <Link
            key={entry.value}
            href={catalogHref({ q, category, level: entry.value })}
            className={cn(
              "rounded-full border px-3 py-1 transition-colors hover:border-brand hover:text-brand",
              level === entry.value &&
                "border-brand bg-brand text-primary-foreground hover:text-primary-foreground",
            )}
          >
            {entry.label}
          </Link>
        ))}
      </div>

      {/* Category pills */}
      {categories.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-muted-foreground">Category:</span>
          {categories.map((entry) => {
            const active = category === entry.slug;
            return (
              <Link
                key={entry.id}
                href={catalogHref({ q, level, category: active ? undefined : entry.slug })}
                className={cn(
                  "rounded-full border px-3 py-1 transition-colors hover:border-brand hover:text-brand",
                  active &&
                    "border-brand bg-brand text-primary-foreground hover:text-primary-foreground",
                )}
              >
                {entry.name}
              </Link>
            );
          })}
        </div>
      ) : null}

      {filtered ? (
        <Link
          href="/courses"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
        >
          <X className="size-3.5" aria-hidden />
          Clear filters
        </Link>
      ) : null}

      {courses.length > 0 ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
