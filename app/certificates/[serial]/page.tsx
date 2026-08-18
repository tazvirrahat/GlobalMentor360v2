import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Award, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCertificateBySerial } from "@/lib/certificates";
import { formatDateLong } from "@/lib/format";

type Params = { params: Promise<{ serial: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { serial } = await params;
  const cert = await getCertificateBySerial(serial);
  if (!cert) notFound();
  return { title: `Certificate · ${cert.course.title}` };
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
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="rounded-3xl border-2 border-brand/30 bg-gradient-to-br from-white via-accent to-white p-10 shadow-brand sm:p-14">
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand text-primary-foreground">
            <Award className="size-7" aria-hidden />
          </span>

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">
            Certificate of completion
          </p>

          <h1 className="text-3xl font-extrabold tracking-tight break-words sm:text-4xl">
            {cert.course.title}
          </h1>

          <p className="text-muted-foreground">This certifies that</p>
          <p className="max-w-full break-words text-2xl font-bold">{cert.user.name}</p>
          <p className="max-w-md text-muted-foreground">
            successfully completed the course on{" "}
            {formatDateLong(cert.issuedAt)}
            .
          </p>

          <div className="mt-4 max-w-full rounded-xl border bg-white/80 px-6 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Serial</p>
            <p className="break-all font-mono text-sm font-semibold">{cert.serial}</p>
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <a href={`/certificates/${cert.serial}/pdf`}>
                <Download className="size-4" aria-hidden /> Download PDF
              </a>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Verify anytime at this public URL · GlobalMentor360
          </p>
        </div>
      </div>
    </main>
  );
}
