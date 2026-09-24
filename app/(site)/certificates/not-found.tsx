import Link from "next/link";
import { CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Certificate not found" };

/**
 * Rendered when /certificates/[serial] calls notFound() for an unknown serial.
 * Lives on the certificates segment (not inside [serial]) so Next actually
 * uses it — a not-found.tsx nested only under the dynamic folder was ignored
 * and the default "This page could not be found" UI rendered instead.
 * Status is 404, matching /certificates/[serial]/pdf.
 */
export default function CertificateNotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <CircleX className="size-7" aria-hidden />
      </span>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Certificate not found</h1>
      <p className="text-muted-foreground">
        No certificate matches that serial. Check the link and try again.
      </p>
      <Button asChild variant="outline">
        <Link href="/courses" className="cursor-pointer">
          Browse courses
        </Link>
      </Button>
    </main>
  );
}
