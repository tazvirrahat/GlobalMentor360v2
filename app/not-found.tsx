import Link from "next/link";
import { CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/**
 * Root 404. Covers unmatched URLs and notFound() from pages that do not have
 * a closer not-found.tsx (unknown course slugs, drafts shown to learners).
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-5 px-4 py-24 text-center sm:px-6">
      <span
        className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden
      >
        <CircleX className="size-6" />
      </span>
      <p className="text-sm font-medium tabular-nums tracking-wide text-primary">404</p>
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Page not found
      </h1>
      <p className="max-w-md text-muted-foreground">
        That page does not exist, or it is not available to you.
      </p>
      <Button asChild size="lg">
        <Link href="/" className="cursor-pointer">
          Go home
        </Link>
      </Button>
    </main>
  );
}
