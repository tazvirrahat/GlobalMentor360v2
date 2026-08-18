"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
      <CircleAlert className="size-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-extrabold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground">
        That page failed to load. Try again, or go back to the catalog.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/courses">Browse courses</Link>
        </Button>
      </div>
    </main>
  );
}
