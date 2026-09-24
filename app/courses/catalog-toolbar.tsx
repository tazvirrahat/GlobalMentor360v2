"use client";

import { ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COURSE_LEVELS } from "@/lib/labels";
import type { CatalogSort } from "@/lib/courses";

const SELECT_CLASS =
  "h-10 w-full min-w-0 cursor-pointer rounded-md border border-input bg-card px-2.5 text-sm shadow-xs transition-[color,box-shadow] duration-150 lg:w-[8.25rem] focus-ring";

const SORTS: { value: CatalogSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
];

const LANGUAGE_LABEL = new Intl.DisplayNames(["en"], { type: "language" });

function omitEmptyFields(form: HTMLFormElement) {
  for (const el of Array.from(form.elements)) {
    if (
      (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) &&
      el.name &&
      !el.value
    ) {
      el.disabled = true;
    }
  }
}

export type CatalogToolbarProps = {
  q?: string;
  level?: string;
  category?: string;
  language?: string;
  price?: string;
  rating?: string;
  sort?: string;
  categories: { id: string; name: string; slug: string }[];
  languages: string[];
};

export function CatalogToolbar({
  q,
  level,
  category,
  language,
  price,
  rating,
  sort,
  categories,
  languages,
}: CatalogToolbarProps) {
  const defaultSort: CatalogSort = q ? "relevance" : "newest";
  const sortOptions = q ? SORTS : SORTS.filter((entry) => entry.value !== "relevance");

  return (
    <form
      action="/courses"
      method="get"
      role="search"
      className="flex flex-col gap-2 lg:flex-row lg:flex-nowrap lg:items-center"
      onChange={(event) => {
        if ((event.target as HTMLElement).tagName !== "SELECT") return;
        omitEmptyFields(event.currentTarget);
        event.currentTarget.requestSubmit();
      }}
      onSubmit={(event) => omitEmptyFields(event.currentTarget)}
    >
      <div className="flex min-w-0 w-full gap-2 lg:min-w-48 lg:flex-1">
        <div className="relative min-w-0 flex-1">
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
        <Button type="submit" className="shrink-0">
          Search
        </Button>
      </div>

      <input id="catalog-filters" type="checkbox" className="peer sr-only lg:hidden" />
      <label
        htmlFor="catalog-filters"
        className="flex min-h-11 cursor-pointer items-center justify-between rounded-md border border-input bg-card px-3 text-sm font-medium shadow-xs peer-checked:[&_svg]:rotate-180 lg:hidden"
      >
        Filters
        <ChevronDown className="size-4 text-muted-foreground transition-transform duration-150" aria-hidden />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2 max-lg:hidden max-lg:peer-checked:grid sm:grid-cols-3 lg:mt-0 lg:flex lg:flex-nowrap lg:gap-2">
          <FilterSelect id="catalog-level" name="level" label="Level" value={level}>
            <option value="">Any level</option>
            {COURSE_LEVELS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect id="catalog-price" name="price" label="Price" value={price}>
            <option value="">Any price</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </FilterSelect>

          <FilterSelect id="catalog-rating" name="rating" label="Rating" value={rating}>
            <option value="">Any rating</option>
            <option value="4">4 stars and up</option>
            <option value="3">3 stars and up</option>
          </FilterSelect>

          {languages.length > 1 ? (
            <FilterSelect id="catalog-language" name="language" label="Language" value={language}>
              <option value="">Any language</option>
              {languages.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABEL.of(code) ?? code}
                </option>
              ))}
            </FilterSelect>
          ) : null}

          {categories.length > 0 ? (
            <FilterSelect id="catalog-category" name="category" label="Category" value={category}>
              <option value="">Any category</option>
              {categories.map((entry) => (
                <option key={entry.id} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </FilterSelect>
          ) : null}

          <FilterSelect
            id="catalog-sort"
            name="sort"
            label="Sort"
            value={sort ?? defaultSort}
            wide
          >
            {sortOptions.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </FilterSelect>
        </div>
    </form>
  );
}

function FilterSelect({
  id,
  name,
  label,
  value,
  wide,
  children,
}: {
  id: string;
  name: string;
  label: string;
  value?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        aria-label={label}
        className={wide ? `${SELECT_CLASS} lg:w-44` : SELECT_CLASS}
      >
        {children}
      </select>
    </div>
  );
}
