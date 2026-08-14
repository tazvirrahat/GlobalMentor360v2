import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CourseCard } from "@/components/site/course-card";
import {
  listCatalogCategories,
  listCatalogLanguages,
  listPublishedCourses,
  type CatalogSort,
} from "@/lib/courses";
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

/** One definition of the pill, rather than a copy per filter row. */
const PILL = "rounded-full border px-3 py-1 transition-colors hover:border-brand hover:text-brand";
const PILL_ON = "border-brand bg-brand text-primary-foreground hover:text-primary-foreground";

const SORTS: { value: CatalogSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
];
const SORT_VALUES = new Set<string>(SORTS.map((entry) => entry.value));

const PRICES: { value: "free" | "paid"; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
];

/** Whole stars only: a "3.5+" filter implies a precision the aggregate does not carry. */
const RATINGS = [4, 3] as const;

/** Renders a language code as something a learner recognises, falling back to the code. */
const LANGUAGE_LABEL = new Intl.DisplayNames(["en"], { type: "language" });

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
  const language = first(params.language) || undefined;
  const rawPrice = first(params.price);
  const price = rawPrice === "free" || rawPrice === "paid" ? rawPrice : undefined;
  const rawRating = Number(first(params.rating));
  const minRating = rawRating >= 1 && rawRating <= 5 ? rawRating : undefined;
  const rawSort = first(params.sort);
  const sort = rawSort && SORT_VALUES.has(rawSort) ? (rawSort as CatalogSort) : undefined;

  // One object carrying every active filter, so a link that changes one cannot
  // silently drop another. Passing filters individually per link is how a level
  // pill quietly clears the language you had chosen.
  const active = {
    q,
    level,
    category,
    language,
    price,
    rating: minRating ? String(minRating) : undefined,
    sort,
  };
  const hrefWith = (patch: Partial<Record<keyof typeof active, string | undefined>>) =>
    catalogHref({ ...active, ...patch });

  const [courses, categories, languages] = await Promise.all([
    listPublishedCourses({
      query: q,
      level,
      categorySlug: category,
      language,
      price,
      minRating,
      sort,
    }),
    listCatalogCategories(),
    listCatalogLanguages(),
  ]);

  const filtered = Boolean(q || level || category || language || price || minRating);

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
        {/* Every active filter rides along, or searching silently resets them. */}
        {Object.entries(active).map(([key, value]) =>
          key === "q" || !value ? null : (
            <input key={key} type="hidden" name={key} value={value} />
          ),
        )}
        <Button type="submit">Search</Button>
      </form>

      {/* Level filter */}
      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-muted-foreground">Level:</span>
        <Link
          href={hrefWith({ level: undefined })}
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
            href={hrefWith({ level: entry.value })}
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

      {/* Price */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-muted-foreground">Price:</span>
        <Link
          href={hrefWith({ price: undefined })}
          className={cn(PILL, !price && PILL_ON)}
        >
          Any
        </Link>
        {PRICES.map((entry) => (
          <Link
            key={entry.value}
            href={hrefWith({ price: price === entry.value ? undefined : entry.value })}
            className={cn(PILL, price === entry.value && PILL_ON)}
          >
            {entry.label}
          </Link>
        ))}
      </div>

      {/* Rating */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-muted-foreground">Rating:</span>
        <Link
          href={hrefWith({ rating: undefined })}
          className={cn(PILL, !minRating && PILL_ON)}
        >
          Any
        </Link>
        {RATINGS.map((stars) => (
          <Link
            key={stars}
            href={hrefWith({ rating: minRating === stars ? undefined : String(stars) })}
            className={cn(PILL, minRating === stars && PILL_ON)}
          >
            {stars}★ &amp; up
          </Link>
        ))}
      </div>

      {/* Language — only when the catalog actually has more than one. */}
      {languages.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-muted-foreground">Language:</span>
          <Link
            href={hrefWith({ language: undefined })}
            className={cn(PILL, !language && PILL_ON)}
          >
            Any
          </Link>
          {languages.map((code) => (
            <Link
              key={code}
              href={hrefWith({ language: language === code ? undefined : code })}
              className={cn(PILL, language === code && PILL_ON)}
            >
              {LANGUAGE_LABEL.of(code) ?? code}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Sort */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-muted-foreground">Sort:</span>
        {SORTS.map((entry) => {
          const on = (sort ?? "newest") === entry.value;
          return (
            <Link
              key={entry.value}
              href={hrefWith({ sort: entry.value === "newest" ? undefined : entry.value })}
              className={cn(PILL, on && PILL_ON)}
            >
              {entry.label}
            </Link>
          );
        })}
      </div>

      {/* Category pills */}
      {categories.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-muted-foreground">Category:</span>
          {categories.map((entry) => {
            const isActive = category === entry.slug;
            return (
              <Link
                key={entry.id}
                href={hrefWith({ category: isActive ? undefined : entry.slug })}
                className={cn(
                  "rounded-full border px-3 py-1 transition-colors hover:border-brand hover:text-brand",
                  isActive &&
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
