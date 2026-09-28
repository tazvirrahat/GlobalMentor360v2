import { NextResponse } from "next/server";
import { getCertificateBySerial } from "@/lib/certificates";
import { renderCertificatePdf } from "@/lib/pdf";
import { getSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serial: string }> },
) {
  const { serial } = await params;
  const cert = await getCertificateBySerial(serial);
  if (!cert) {
    return new NextResponse("Certificate not found", { status: 404 });
  }

  const base = getSite().url;
  const pdf = renderCertificatePdf({
    serial: cert.serial,
    learnerName: cert.user.name,
    courseTitle: cert.course.title,
    issuedAt: cert.issuedAt,
    verifyUrl: `${base}/certificates/${cert.serial}`,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${cert.serial}.pdf"`,
    },
  });
}
