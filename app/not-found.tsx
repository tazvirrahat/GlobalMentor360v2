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
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
      <CircleX className="size-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-extrabold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        That page does not exist, or it is not available to you.
      </p>
      <Button asChild variant="outline">
        <Link href="/courses">Browse courses</Link>
      </Button>
    </main>
  );
}
