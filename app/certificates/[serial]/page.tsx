import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Award, BadgeCheck, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCertificateBySerial } from "@/lib/certificates";
import { formatDateLong } from "@/lib/format";

type Params = { params: Promise<{ serial: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { serial } = await params;
  const cert = await getCertificateBySerial(serial);
  if (!cert) notFound();
  return {
    title: `Certificate: ${cert.course.title}`,
    description: `${cert.user.name} completed ${cert.course.title}. Certificate ${cert.serial}.`,
  };
}

export const dynamic = "force-dynamic";

export default async function CertificatePage({ params }: Params) {
  const { serial } = await params;
  const cert = await getCertificateBySerial(serial);

  // Public verification URL: an unknown serial must be a real 404 (same as
  // /pdf), not a 200 that only looks like a failure to humans. The UI lives in
  // ../not-found.tsx so Next actually picks it up.
  if (!cert) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
      <article className="relative overflow-hidden rounded-lg border border-primary/25 bg-card p-1.5 shadow-sm print:border-primary/40 print:shadow-none">
        <div className="relative rounded-md border border-primary/15 bg-background px-6 py-10 sm:px-12 sm:py-14">
          <span
            className="pointer-events-none absolute left-4 top-4 size-10 border-l-2 border-t-2 border-primary/30"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute right-4 top-4 size-10 border-r-2 border-t-2 border-primary/30"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute bottom-4 left-4 size-10 border-b-2 border-l-2 border-primary/30"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute bottom-4 right-4 size-10 border-b-2 border-r-2 border-primary/30"
            aria-hidden
          />

          <div className="flex flex-col items-center gap-5 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Award className="size-7" aria-hidden />
            </span>

            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Certificate of completion
            </p>

            <h1 className="max-w-full break-words font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {cert.course.title}
            </h1>

            <p className="text-muted-foreground">This certifies that</p>
            <p className="max-w-full break-words font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              {cert.user.name}
            </p>
            <p className="max-w-md text-muted-foreground">
              successfully completed the course on {formatDateLong(cert.issuedAt)}.
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <Badge variant="success" className="gap-1.5 px-3 py-1">
                <BadgeCheck className="size-3.5" aria-hidden />
                Verified
              </Badge>
              <div className="max-w-full rounded-lg border bg-card px-4 py-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Serial</p>
                <p className="break-all font-mono text-sm font-semibold">{cert.serial}</p>
              </div>
            </div>

            <div className="mt-2 print:hidden">
              <Button asChild>
                <a href={`/certificates/${cert.serial}/pdf`} className="cursor-pointer">
                  <Download className="size-4" aria-hidden /> Download PDF
                </a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Anyone can check this certificate at this address.
            </p>
          </div>
        </div>
      </article>
    </main>
  );
}
