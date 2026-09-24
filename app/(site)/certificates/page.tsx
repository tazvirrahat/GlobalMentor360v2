import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeSerial } from "@/lib/certificate-serial";
import { getSite } from "@/lib/site";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description: `Check that a ${getSite().name} certificate is genuine. Enter the certificate number to see who earned it and for which course.`,
};

type Props = { searchParams: Promise<{ serial?: string | string[] }> };

/**
 * "Verify a certificate" from the top bar. The form is a plain GET so it works
 * without JavaScript; a valid number goes straight to the certificate's page,
 * which is the real check (it 404s for numbers that were never issued).
 */
export default async function VerifyCertificatePage({ searchParams }: Props) {
  const raw = (await searchParams).serial;
  const typed = Array.isArray(raw) ? raw[0] : raw;
  const site = getSite();

  let error: string | null = null;
  if (typed !== undefined) {
    const serial = normalizeSerial(typed, site.certificatePrefix);
    if (serial) redirect(`/certificates/${serial}` as Route);
    error = typed.trim()
      ? `That is not a certificate number. It looks like ${site.certificatePrefix}-1A2B-3C4D-5E6F-7A8B.`
      : "Enter the certificate number.";
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">Verify a certificate</h1>
        <p className="text-lg text-graphite">
          Every certificate has its own page. Enter the number printed on the certificate, or paste its
          link, to see who earned it, for which course and when.
        </p>
      </div>

      <form method="get" action="/certificates" className="flex flex-col gap-3" noValidate>
        <Label htmlFor="serial">Certificate number</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="serial"
            name="serial"
            defaultValue={typed ?? ""}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={`${site.certificatePrefix}-1A2B-3C4D-5E6F-7A8B`}
            aria-describedby={error ? "serial-hint serial-error" : "serial-hint"}
            aria-invalid={error ? true : undefined}
            autoFocus={Boolean(error)}
            className="h-11 font-mono text-base sm:flex-1"
          />
          <Button type="submit" size="lg">
            Check certificate
          </Button>
        </div>
        <p id="serial-hint" className="text-sm text-graphite">
          Capital or small letters both work, and the dashes are optional.
        </p>
        {error ? (
          <p id="serial-error" role="alert" className="text-sm font-medium text-seal">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
