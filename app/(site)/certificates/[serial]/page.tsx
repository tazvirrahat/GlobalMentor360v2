import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Certificate } from "@/components/course/certificate";
import { Button } from "@/components/ui/button";
import { getCertificateBySerial } from "@/lib/certificates";
import { getSite } from "@/lib/site";

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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
      <Certificate
        size="full"
        siteName={getSite().name}
        recipient={cert.user.name}
        course={cert.course.title}
        issuedAt={cert.issuedAt}
        serial={cert.serial}
        courseHeadingLevel={1}
      />
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button asChild size="lg">
          <a href={`/certificates/${cert.serial}/pdf`}>
            <Download className="size-4" aria-hidden /> Download PDF
          </a>
        </Button>
        <p className="text-sm text-graphite">Anyone can check this certificate at this address.</p>
      </div>
    </main>
  );
}
