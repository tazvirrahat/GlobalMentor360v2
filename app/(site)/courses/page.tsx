import type { Route } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { CourseRow } from "@/components/course/course-row";
import { PageNav } from "@/components/site/page-nav";
import { Button } from "@/components/ui/button";
import { listTopCategoriesWithCounts } from "@/lib/categories";
import {
  CATALOG_PAGE_SIZE,
  listCatalogLanguages,
  listPublishedCourses,
  type CatalogSort,
} from "@/lib/courses";
import { COURSE_LEVELS } from "@/lib/labels";
import { showingRange } from "@/lib/pagination";
import type { CourseLevel } from "@/generated/prisma/enums";
import { CatalogBrowser, type CatalogValues, type FilterDef } from "./catalog-browser";

export const metadata = {
  title: "Online Courses",
  description:
    "Browse online courses by subject, level, price and rating. Learn at your own pace and earn a certificate when you finish.",
};

// Without this Next prerenders the catalog at build time, which breaks two ways:
// newly published courses never appear until a redeploy, and the build itself
// fails anywhere the database isn't reachable (CI). Revisit with `revalidate`
// once we want CDN caching — but a build-time snapshot is never right here.
export const dynamic = "force-dynamic";

const LEVEL_VALUES = new Set<string>(COURSE_LEVELS.map((entry) => entry.value));

const SORTS: { value: CatalogSort; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "newest", label: "Newest" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
];
const SORT_VALUES = new Set<string>(SORTS.map((entry) => entry.value));

const PRICES = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
];
const RATINGS = [
  { value: "4", label: "4 stars and up" },
  { value: "3", label: "3 stars and up" },
];

const LANGUAGE_LABEL = new Intl.DisplayNames(["en"], { type: "language" });

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hrefFor(values: CatalogValues): Route {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  const query = params.toString();
  return (query ? `/courses?${query}` : "/courses") as Route;
}

function courses(count: number) {
  return `${count} ${count === 1 ? "course" : "courses"}`;
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
  // "Best match" only means something when there is a search.
  const sort =
    rawSort && SORT_VALUES.has(rawSort) && (rawSort !== "relevance" || q) ? (rawSort as CatalogSort) : undefined;

  // One object carrying every active filter, so a link that changes one cannot
  // silently drop another.
  const values: CatalogValues = {
    q,
    level,
    category,
    language,
    price,
    rating: minRating ? String(minRating) : undefined,
    sort,
  };

  const [catalog, subjects, languages] = await Promise.all([
    listPublishedCourses({
      query: q,
      level,
      categorySlug: category,
      language,
      price,
      minRating,
      sort,
      page: first(params.page),
    }),
    listTopCategoriesWithCounts(),
    listCatalogLanguages(),
  ]);

  const categoryName = new Map<string, string>();
  for (const subject of subjects) {
    categoryName.set(subject.slug, subject.name);
    for (const child of subject.children) categoryName.set(child.slug, child.name);
  }

  const allFilters: FilterDef[] = [
    {
      key: "category",
      label: "Subject",
      anyLabel: "All subjects",
      options: [],
      groups: subjects.map((subject) => ({
        label: subject.name,
        options: [
          { value: subject.slug, label: `All of ${subject.name}` },
          ...subject.children.map((child) => ({ value: child.slug, label: child.name })),
        ],
      })),
    },
    {
      key: "level",
      label: "Level",
      anyLabel: "Any level",
      options: COURSE_LEVELS.map((entry) => ({ value: entry.value, label: entry.label })),
    },
    { key: "price", label: "Price", anyLabel: "Any price", options: PRICES },
    { key: "rating", label: "Rating", anyLabel: "Any rating", options: RATINGS },
    {
      key: "language",
      label: "Language",
      anyLabel: "Any language",
      options: languages.map((code) => ({ value: code, label: LANGUAGE_LABEL.of(code) ?? code })),
    },
    {
      key: "sort",
      label: "Sort by",
      options: (q ? SORTS : SORTS.filter((entry) => entry.value !== "relevance")).map(({ value, label }) => ({
        value,
        label,
      })),
    },
  ];
  // A choice between one option is not a filter.
  const filters = allFilters.filter(
    (def) => def.key === "sort" || def.options.length + (def.groups?.length ?? 0) > (def.key === "language" ? 1 : 0),
  );
  // The sort select shows what the list is actually sorted by.
  const defaults: CatalogValues = { sort: q ? "relevance" : "newest" };

  const chips: { key: keyof CatalogValues; label: string }[] = [];
  if (q) chips.push({ key: "q", label: `“${q}”` });
  if (category) chips.push({ key: "category", label: categoryName.get(category) ?? category });
  if (level) chips.push({ key: "level", label: COURSE_LEVELS.find((entry) => entry.value === level)?.label ?? level });
  if (price) chips.push({ key: "price", label: price === "free" ? "Free" : "Paid" });
  if (minRating) chips.push({ key: "rating", label: `${minRating} stars and up` });
  if (language) chips.push({ key: "language", label: LANGUAGE_LABEL.of(language) ?? language });
  const filtered = chips.length > 0;

  const range = showingRange(catalog.page, CATALOG_PAGE_SIZE, catalog.total);
  const status =
    catalog.total === 0
      ? "No courses match."
      : catalog.pageCount > 1
        ? `${range.from} to ${range.to} of ${courses(catalog.total)}`
        : courses(catalog.total);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold sm:text-4xl">Courses</h1>

      <CatalogBrowser values={values} defaults={defaults} filters={filters}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p role="status" className="text-sm font-medium text-ink">
              {status}
            </p>
            {filtered ? (
              <ul aria-label="Applied filters" className="flex min-w-0 flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <li key={chip.key}>
                    <Link
                      href={hrefFor({ ...values, [chip.key]: undefined })}
                      aria-label={`Remove filter: ${chip.label}`}
                      className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-sm border border-control bg-surface px-2.5 text-sm text-ink hover:bg-wash focus-ring"
                    >
                      <span className="min-w-0 truncate">{chip.label}</span>
                      <X className="size-3.5 shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={hrefFor({ sort })}
                    className="inline-flex min-h-8 items-center rounded-sm px-1 text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                  >
                    Clear filters
                  </Link>
                </li>
              </ul>
            ) : null}
          </div>

          {catalog.items.length > 0 ? (
            <section aria-labelledby="catalog-results-heading">
              <h2 id="catalog-results-heading" className="sr-only">
                Results
              </h2>
              <ul className="flex flex-col divide-y divide-rule border-y border-rule">
                {catalog.items.map((course) => (
                  <li key={course.id}>
                    <CourseRow course={course} />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-6">
              <h2 className="text-lg font-semibold">
                {filtered ? "No courses match these filters" : "No courses yet"}
              </h2>
              <p className="max-w-prose text-graphite">
                {filtered
                  ? `No course matches ${new Intl.ListFormat("en", { type: "conjunction" }).format(chips.map((chip) => chip.label))}${chips.length > 1 ? " together" : ""}. Remove a filter above, or clear them all.`
                  : "New courses appear here when they are published."}
              </p>
              {filtered ? (
                <Button asChild>
                  <Link href="/courses">Clear filters</Link>
                </Button>
              ) : null}
            </div>
          )}

          <PageNav
            pathname="/courses"
            params={values as Record<string, string | undefined>}
            page={catalog.page}
            pageCount={catalog.pageCount}
          />
        </div>
      </CatalogBrowser>
    </main>
  );
}
