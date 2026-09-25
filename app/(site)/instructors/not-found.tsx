import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Instructor not found" };

/**
 * Rendered when /instructors/[slug] calls notFound(): an unknown address, a
 * hidden profile, or someone with no published course. Lives on the
 * instructors segment so Next uses it (see certificates/not-found.tsx).
 */
export default function InstructorNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-start gap-5 px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold">We couldn&apos;t find that instructor</h1>
      <p className="text-lg text-graphite">The page may have moved, or the instructor has hidden it.</p>
      <Button asChild>
        <Link href="/courses">Browse courses</Link>
      </Button>
    </main>
  );
}
