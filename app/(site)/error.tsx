"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** An error inside a site page keeps the top bar and footer around it. */
export default function Error({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-3xl font-semibold sm:text-4xl">Something went wrong</h1>
      <p className="text-lg text-graphite">This page failed to load. Try again, or go back to the home page.</p>
      <div className="flex flex-wrap gap-2">
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
