import Link from "next/link";
import { BookOpen, SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/site/course-card";
import { EmptyState } from "@/components/site/empty-state";
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
import { CatalogToolbar } from "./catalog-toolbar";

export const metadata = {
  title: "Online Courses",
  description:
    "Browse online courses by category, level, price and rating. Learn at your own pace and earn a certificate when you finish.",
};

// Without this Next prerenders the catalog at build time, which breaks two ways:
// newly published courses never appear until a redeploy, and the build itself
// fails anywhere the database isn't reachable (CI). Revisit with `revalidate`
// once we want CDN caching — but a build-time snapshot is never right here.
export const dynamic = "force-dynamic";

const LEVEL_VALUES = new Set<string>(COURSE_LEVELS.map((entry) => entry.value));

const SORTS: { value: CatalogSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
];
const SORT_VALUES = new Set<string>(SORTS.map((entry) => entry.value));

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
  const showingCopy =
    catalog.total === 0
      ? filtered
        ? "No courses match your filters."
        : "No published courses yet — check back soon."
      : `Showing ${range.from}–${range.to} of ${catalog.total} course${catalog.total === 1 ? "" : "s"}${filtered ? " found" : ""}.`;

  const chips: { key: string; label: string; href: ReturnType<typeof hrefWith> }[] = [];
  if (q) chips.push({ key: "q", label: q, href: hrefWith({ q: undefined }) });
  if (level) {
    chips.push({
      key: "level",
      label: COURSE_LEVELS.find((entry) => entry.value === level)?.label ?? level,
      href: hrefWith({ level: undefined }),
    });
  }
  if (price) {
    chips.push({
      key: "price",
      label: price === "free" ? "Free" : "Paid",
      href: hrefWith({ price: undefined }),
    });
  }
  if (minRating) {
    chips.push({
      key: "rating",
      label: `${minRating} stars and up`,
      href: hrefWith({ rating: undefined }),
    });
  }
  if (language) {
    chips.push({
      key: "language",
      label: LANGUAGE_LABEL.of(language) ?? language,
      href: hrefWith({ language: undefined }),
    });
  }
  if (category) {
    chips.push({
      key: "category",
      label: categories.find((entry) => entry.slug === category)?.name ?? category,
      href: hrefWith({ category: undefined }),
    });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-12 sm:px-6 lg:px-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Courses</h1>

      <div className="mt-4">
        <CatalogToolbar
          q={q}
          level={level}
          category={category}
          language={language}
          price={price}
          rating={minRating ? String(minRating) : undefined}
          sort={sort}
          categories={categories}
          languages={languages}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-muted-foreground">{showingCopy}</p>
        {chips.length > 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <Link
                key={chip.key}
                href={chip.href}
                className="inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1 rounded-full border border-border bg-secondary px-2.5 text-sm text-secondary-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus-ring"
                aria-label={`Clear ${chip.label} filter`}
              >
                <span className="min-w-0 truncate">{chip.label}</span>
                <X className="size-3.5 shrink-0" aria-hidden />
              </Link>
            ))}
            {filtered ? (
              <Link
                href="/courses"
                className="inline-flex min-h-8 cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <X className="size-3.5" aria-hidden />
                Clear filters
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {courses.length > 0 ? (
        <section aria-labelledby="catalog-results-heading" className="mt-3">
          <h2 id="catalog-results-heading" className="sr-only">
            Results
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          className="mt-3"
          icon={
            filtered ? (
              <SearchX className="size-6" aria-hidden />
            ) : (
              <BookOpen className="size-6" aria-hidden />
            )
          }
          title={
            filtered
              ? "No courses match"
              : "No published courses yet"
          }
          message={
            filtered
              ? q
                ? `No courses match “${q}”. Try a different search or clear your filters.`
                : "No courses match those filters. Clear them to see everything in the catalog."
              : "Check back soon — new courses appear here when they are published."
          }
        >
          {filtered ? (
            <Button asChild>
              <Link href="/courses" className="cursor-pointer">
                Clear filters
              </Link>
            </Button>
          ) : null}
        </EmptyState>
      )}
      <PageNav
        pathname="/courses"
        params={active as Record<string, string | undefined>}
        page={catalog.page}
        pageCount={catalog.pageCount}
      />
    </main>
  );
}
