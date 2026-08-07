import type { Metadata } from "next";
import Link from "next/link";
import { Award, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCertificateBySerial } from "@/lib/certificates";

type Params = { params: Promise<{ serial: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { serial } = await params;
  const cert = await getCertificateBySerial(serial);
  return {
    title: cert ? `Certificate · ${cert.course.title}` : "Certificate not found",
  };
}

export const dynamic = "force-dynamic";

export default async function CertificatePage({ params }: Params) {
  const { serial } = await params;
  const cert = await getCertificateBySerial(serial);

  if (!cert) {
    return (
      <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
        <CircleX className="size-10 text-destructive" aria-hidden />
        <h1 className="text-2xl font-extrabold tracking-tight">Certificate not found</h1>
        <p className="text-muted-foreground">
          No certificate matches serial <code className="font-mono text-sm">{serial}</code>. Check
          the link and try again.
        </p>
        <Button asChild variant="outline">
          <Link href="/courses">Browse courses</Link>
        </Button>
      </main>
    );
  }

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

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {cert.course.title}
          </h1>

          <p className="text-muted-foreground">This certifies that</p>
          <p className="text-2xl font-bold">{cert.user.name}</p>
          <p className="max-w-md text-muted-foreground">
            successfully completed the course on{" "}
            {cert.issuedAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>

          <div className="mt-4 rounded-xl border bg-white/80 px-6 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Serial</p>
            <p className="font-mono text-sm font-semibold">{cert.serial}</p>
          </div>

          <p className="text-xs text-muted-foreground">
            Verify anytime at this public URL · GlobalMentor360
          </p>
        </div>
      </div>
    </main>
  );
}
