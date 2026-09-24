import Link from "next/link";
import { SiteChrome } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/**
 * Root 404: unmatched URLs and notFound() from pages without a closer
 * not-found.tsx. It renders inside the root layout only, so it draws the site
 * chrome itself.
 */
export default function NotFound() {
  return (
    <SiteChrome>
      <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 px-4 py-24 text-center sm:px-6">
        <h1 className="text-3xl font-semibold sm:text-4xl">Page not found</h1>
        <p className="max-w-md text-graphite">
          That page does not exist, or it is not available to you.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
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
