import Link from "next/link";
import { Search } from "lucide-react";
import { SiteChrome } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Page not found" };

/**
 * Root 404: unmatched URLs and notFound() from pages without a closer
 * not-found.tsx. It renders inside the root layout only, so it draws the site
 * chrome itself.
 */
export default function NotFound() {
  return (
    <SiteChrome>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-3xl font-semibold sm:text-4xl">Page not found</h1>
        <p className="text-lg text-graphite">
          That page does not exist, or it is not available to you. Try a search, or start from the course list.
        </p>
        <form role="search" action="/courses" method="get" className="flex gap-2">
          <label htmlFor="not-found-search" className="sr-only">
            Search courses
          </label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-graphite" aria-hidden />
            <Input id="not-found-search" type="search" name="q" placeholder="Search courses" className="h-11 pl-9 text-base" />
          </div>
          <Button type="submit" size="lg">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/courses">Browse courses</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/">Go to the home page</Link>
          </Button>
        </div>
      </main>
    </SiteChrome>
  );
}
