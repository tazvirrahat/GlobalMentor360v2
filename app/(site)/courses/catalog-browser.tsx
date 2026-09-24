"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type CatalogValues = {
  q?: string;
  level?: string;
  price?: string;
  rating?: string;
  language?: string;
  category?: string;
  sort?: string;
};

type Option = { value: string; label: string };
export type FilterDef = {
  key: Exclude<keyof CatalogValues, "q">;
  label: string;
  /** The "no filter" choice, e.g. "Any level". Sort has none. */
  anyLabel?: string;
  options: Option[];
  groups?: { label: string; options: Option[] }[];
};

const SELECT =
  "h-10 w-full min-w-0 cursor-pointer rounded-md border border-input bg-surface px-2.5 text-sm text-ink focus-ring";

function toHref(pathname: string, values: CatalogValues) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function FilterSelect({
  def,
  value,
  id,
  name,
  onChange,
}: {
  def: FilterDef;
  value: string;
  id: string;
  name?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-graphite">
        {def.label}
      </label>
      <select id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} className={SELECT}>
        {def.anyLabel ? <option value="">{def.anyLabel}</option> : null}
        {def.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {def.groups?.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/**
 * The catalog's search and filters, and the results region they update.
 *
 * On desktop a filter applies as soon as it changes, by client-side
 * navigation: the page does not reload and focus stays on the select (WCAG
 * 3.2.2), and the result count is announced from the results region. On
 * phones the filters live in a sheet and apply when "Show results" is
 * pressed. Without JavaScript the form is a plain GET that the Search button
 * submits.
 */
export function CatalogBrowser({
  values,
  defaults = {},
  filters,
  children,
}: {
  values: CatalogValues;
  /** What a select shows when its value is not in the URL (the sort in effect). */
  defaults?: CatalogValues;
  filters: FilterDef[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // Local copies so a select shows its new value at once, while the navigation
  // is pending; they follow the URL again whenever it changes (a chip, the
  // pager, back/forward). Adjusting state during render is React's pattern
  // for this, and it keeps the focused select mounted.
  const key = JSON.stringify(values);
  const [seen, setSeen] = useState(key);
  const [local, setLocal] = useState<CatalogValues>(values);
  const [q, setQ] = useState(values.q ?? "");
  if (seen !== key) {
    setSeen(key);
    setLocal(values);
    setQ(values.q ?? "");
  }
  const [draft, setDraft] = useState<CatalogValues>(values);
  const [sheetOpen, setSheetOpen] = useState(false);

  const applied = filters.filter((def) => def.anyLabel && values[def.key]).length;

  function go(next: CatalogValues) {
    setLocal(next);
    // Any change of filters starts again at page 1 (the page param is dropped).
    startTransition(() => router.replace(toHref(pathname, next) as never, { scroll: false }));
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        role="search"
        action={pathname}
        method="get"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          go({ ...local, q: q.trim() || undefined });
        }}
      >
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-graphite" aria-hidden />
            <Input
              type="search"
              name="q"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search for a course, skill or instructor"
              aria-label="Search courses"
              className="h-11 pl-9 text-base"
            />
          </div>
          <Button type="submit" size="lg">
            Search
          </Button>
        </div>

        {/* Desktop: filters in one row, applied on change. */}
        <div className="hidden grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3 lg:grid">
          {filters.map((def) => (
            <FilterSelect
              key={def.key}
              def={def}
              id={`catalog-${def.key}`}
              name={def.key}
              value={local[def.key] ?? defaults[def.key] ?? ""}
              onChange={(value) => go({ ...local, [def.key]: value || undefined })}
            />
          ))}
        </div>
      </form>

      {/* Phones: a Filters button opening a sheet; nothing applies until "Show results". */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (open) setDraft(values);
        }}
      >
        <SheetTrigger asChild>
          <Button variant="secondary" size="lg" className="w-full justify-between lg:hidden">
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="size-4" aria-hidden />
              Filters
            </span>
            <span className="text-sm font-normal text-graphite">
              {applied > 0 ? `${applied} applied` : "None applied"}
            </span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" title="Filters">
          <form
            className="flex flex-col gap-4 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              setSheetOpen(false);
              go({ ...draft, q: values.q });
            }}
          >
            {filters.map((def) => (
              <FilterSelect
                key={def.key}
                def={def}
                id={`catalog-sheet-${def.key}`}
                value={draft[def.key] ?? defaults[def.key] ?? ""}
                onChange={(value) => setDraft((current) => ({ ...current, [def.key]: value || undefined }))}
              />
            ))}
            <div className="flex gap-2 pt-2">
              <SheetClose asChild>
                <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => go({ q: values.q })}>
                  Clear all
                </Button>
              </SheetClose>
              <Button type="submit" size="lg" className="flex-1">
                Show results
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <div aria-busy={pending} className={cn("transition-opacity duration-150", pending && "opacity-60")}>
        {children}
      </div>
    </div>
  );
}
