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
    <main className="mx-auto flex max-w-lg flex-col items-center gap-5 px-4 py-24 text-center sm:px-6">
      <span
        className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden
      >
        <CircleAlert className="size-6" />
      </span>
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Something went wrong
      </h1>
      <p className="max-w-md text-muted-foreground">
        That page failed to load. Try again, or go back home.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/" className="cursor-pointer">
            Go home
          </Link>
        </Button>
      </div>
    </main>
  );
}
