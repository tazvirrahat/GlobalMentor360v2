import { VerifyCertificateForm } from "@/components/course/verify-certificate-form";
import { getSite } from "@/lib/site";

export const metadata = { title: "Certificate not found" };

/**
 * Rendered when /certificates/[serial] calls notFound() for an unknown number.
 * Lives on the certificates segment (not inside [serial]) so Next actually
 * uses it; the status is 404, matching /certificates/[serial]/pdf.
 */
export default function CertificateNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold">No certificate with that number</h1>
        <p className="text-lg text-graphite">
          Check the number on the certificate and try again. It looks like {getSite().certificatePrefix}-1A2B-3C4D-5E6F-7A8B.
        </p>
      </div>
      <VerifyCertificateForm id="retry-serial" />
    </main>
  );
}
