import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A GET search for an admin list: the result is a URL, so it can be shared and
 * survives a reload. `keep` carries the list's other filters through a search.
 */
export function SearchBox({
  action,
  label,
  placeholder,
  value,
  keep,
}: {
  action: Route;
  label: string;
  placeholder?: string;
  value?: string;
  keep?: Record<string, string | undefined>;
}) {
  const id = `search-${action.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <form action={action} role="search" className="flex w-full max-w-lg flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(keep ?? {}).map(([key, keptValue]) =>
          keptValue ? <input key={key} type="hidden" name={key} value={keptValue} /> : null,
        )}
        <Input id={id} type="search" name="q" defaultValue={value ?? ""} placeholder={placeholder} className="min-w-0 flex-1" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {value ? (
          <Link
            href={action}
            className="inline-flex min-h-10 items-center rounded-sm px-1 text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
