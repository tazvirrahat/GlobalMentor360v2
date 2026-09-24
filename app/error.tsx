"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSite } from "@/lib/site";

/**
 * Fallback for the learn and app areas, which have no site chrome around them.
 * Site pages use app/(site)/error.tsx, which keeps the top bar and footer.
 */
export default function Error({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 px-4 py-24 text-center sm:px-6">
      <Link href="/" className="rounded-sm text-lg font-bold text-ink focus-ring">
        {getSite().name}
      </Link>
      <h1 className="text-3xl font-semibold sm:text-4xl">Something went wrong</h1>
      <p className="max-w-md text-graphite">
        This page failed to load. Try again, or go back to the home page.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" size="lg" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/">Go to the home page</Link>
        </Button>
      </div>
    </main>
  );
}
