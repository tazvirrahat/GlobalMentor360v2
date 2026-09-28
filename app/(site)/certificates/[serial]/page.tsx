import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { Certificate } from "@/components/course/certificate";
import { getCertificateBySerial } from "@/lib/certificates";
import { formatDateLong } from "@/lib/format";
import { getSite, siteUrl } from "@/lib/site";
import { CertificateActions } from "./certificate-actions";

type Params = { params: Promise<{ serial: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { serial } = await params;
  const cert = await getCertificateBySerial(serial);
  if (!cert) notFound();
  return {
    title: `Certificate: ${cert.course.title}`,
    description: `${cert.user.name} completed ${cert.course.title} on ${formatDateLong(cert.issuedAt)}. Verified by ${getSite().name}.`,
  };
}

export const dynamic = "force-dynamic";

/**
 * The certificate's permanent public record: the certificate itself,
 * the ways to share it, and in plain words what it proves. An unknown number
 * is a real 404 (same as /pdf); the UI for that is ../not-found.tsx.
 */
export default async function CertificatePage({ params }: Params) {
  const { serial } = await params;
  const cert = await getCertificateBySerial(serial);
  if (!cert) notFound();

  const site = getSite();
  const issued = formatDateLong(cert.issuedAt);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:px-8 print:max-w-none print:px-0 print:py-0">
      <p className="flex items-start gap-2 text-base text-ink print:hidden">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-verified" strokeWidth={1.75} aria-hidden />
        <span>
          <strong className="font-semibold text-verified">Verified certificate.</strong> Issued by {site.name} to{" "}
          {cert.user.name} on {issued}.
        </span>
      </p>

      <div className="pr-2.5 pb-2.5">
        <Certificate
          size="full"
          siteName={site.name}
          recipient={cert.user.name}
          course={cert.course.title}
          issuedAt={cert.issuedAt}
          serial={cert.serial}
          courseHeadingLevel={1}
        />
      </div>

      <div className="print:hidden">
        <CertificateActions
          url={siteUrl(`/certificates/${cert.serial}`)}
          pdfHref={`/certificates/${cert.serial}/pdf`}
          title={`${cert.user.name}: ${cert.course.title}`}
        />
      </div>

      <section aria-labelledby="proves-heading" className="flex flex-col gap-3 border-t border-rule pt-6 print:hidden">
        <h2 id="proves-heading" className="text-xl font-semibold">
          What this certificate shows
        </h2>
        <p className="max-w-[68ch]">
          {cert.user.name} finished every lesson and passed every quiz in {cert.course.title}. The course was completed
          on {issued}.
        </p>
        <p className="max-w-[68ch] text-graphite">
          This page is the certificate&rsquo;s permanent record, and anyone can open it. A number that was never
          issued shows a &ldquo;not found&rdquo; page instead, so a certificate that opens here is genuine.
        </p>
      </section>
    </main>
  );
}
