import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CourseCard } from "@/components/site/course-card";
import {
  CATALOG_PAGE_SIZE,
  listCatalogCategories,
  listCatalogLanguages,
  listPublishedCourses,
  type CatalogSort,
} from "@/lib/courses";
import { COURSE_LEVELS } from "@/lib/labels";
import { showingRange } from "@/lib/pagination";
import { PageNav } from "@/components/site/page-nav";
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

const LEVEL_VALUES = new Set<string>(COURSE_LEVELS.map((entry) => entry.value));

/** One definition of the pill, rather than a copy per filter row. */
const PILL =
  "inline-flex min-h-11 items-center rounded-full border px-3 py-2 transition-colors hover:border-brand hover:text-brand";
const PILL_ON = "border-brand bg-brand text-primary-foreground hover:text-primary-foreground";

const SORTS: { value: CatalogSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
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

  const rawPage = first(params.page);
  const [catalog, categories, languages] = await Promise.all([
    listPublishedCourses({
      query: q,
      level,
      categorySlug: category,
      language,
      price,
      minRating,
      sort,
      page: rawPage,
    }),
    listCatalogCategories(),
    listCatalogLanguages(),
  ]);

  const filtered = Boolean(q || level || category || language || price || minRating);
  const courses = catalog.items;
  const range = showingRange(catalog.page, CATALOG_PAGE_SIZE, catalog.total);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Courses</h1>
      <p className="mt-2 text-muted-foreground">
        {catalog.total === 0
          ? filtered
            ? "No courses match your filters."
            : "No published courses yet — check back soon."
          : `Showing ${range.from}–${range.to} of ${catalog.total} course${catalog.total === 1 ? "" : "s"}${filtered ? " found" : ""}.`}
      </p>

      {/* Search — GET form so results are linkable and back-button friendly. */}
      <form action="/courses" method="get" className="mt-6 flex max-w-xl min-w-0 flex-col gap-2 sm:flex-row" role="search">
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
      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Level">
        <span className="font-semibold text-muted-foreground">Level:</span>
        <Link
          href={hrefWith({ level: undefined })}
          className={cn(PILL, !level && PILL_ON)}
          aria-label="Any level"
        >
          Any
        </Link>
        {COURSE_LEVELS.map((entry) => (
          <Link
            key={entry.value}
            href={hrefWith({ level: entry.value })}
            className={cn(PILL, level === entry.value && PILL_ON)}
          >
            {entry.label}
          </Link>
        ))}
      </div>

      {/* Price */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Price">
        <span className="font-semibold text-muted-foreground">Price:</span>
        <Link
          href={hrefWith({ price: undefined })}
          className={cn(PILL, !price && PILL_ON)}
          aria-label="Any price"
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
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Rating">
        <span className="font-semibold text-muted-foreground">Rating:</span>
        <Link
          href={hrefWith({ rating: undefined })}
          className={cn(PILL, !minRating && PILL_ON)}
          aria-label="Any rating"
        >
          Any
        </Link>
        {RATINGS.map((stars) => (
          <Link
            key={stars}
            href={hrefWith({ rating: minRating === stars ? undefined : String(stars) })}
            className={cn(PILL, minRating === stars && PILL_ON)}
            aria-label={`${stars} stars and up`}
          >
            {stars}★ and up
          </Link>
        ))}
      </div>

      {/* Language — only when the catalog actually has more than one. */}
      {languages.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Language">
          <span className="font-semibold text-muted-foreground">Language:</span>
          <Link
            href={hrefWith({ language: undefined })}
            className={cn(PILL, !language && PILL_ON)}
            aria-label="Any language"
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
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Sort">
        <span className="font-semibold text-muted-foreground">Sort:</span>
        {(q ? SORTS : SORTS.filter((entry) => entry.value !== "relevance")).map((entry) => {
          const defaultSort = q ? "relevance" : "newest";
          const on = (sort ?? defaultSort) === entry.value;
          return (
            <Link
              key={entry.value}
              href={hrefWith({ sort: entry.value === defaultSort ? undefined : entry.value })}
              className={cn(PILL, on && PILL_ON)}
            >
              {entry.label}
            </Link>
          );
        })}
      </div>

      {/* Category pills */}
      {categories.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Category">
          <span className="font-semibold text-muted-foreground">Category:</span>
          {categories.map((entry) => {
            const isActive = category === entry.slug;
            return (
              <Link
                key={entry.id}
                href={hrefWith({ category: isActive ? undefined : entry.slug })}
                className={cn(PILL, isActive && PILL_ON)}
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
      <PageNav
        pathname="/courses"
        params={active as Record<string, string | undefined>}
        page={catalog.page}
        pageCount={catalog.pageCount}
      />
    </main>
  );
}
