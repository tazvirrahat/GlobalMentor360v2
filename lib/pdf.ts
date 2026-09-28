/**
 * A tiny PDF 1.4 writer. Certificates are a few lines of text on a landscape
 * page; pulling in a renderer for that would be a dependency the rest of the
 * app never needed.
 *
 * Helvetica is one of the 14 standard fonts, so the file needs no embedded
 * font. Characters outside Latin-1 become "?" — names in other scripts will
 * look wrong on the PDF even though the public HTML page renders them.
 */

import { formatDateLong } from "@/lib/format";
import { getSite } from "@/lib/site";

function pdfEscape(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\\" || char === "(" || char === ")") {
      out += `\\${char}`;
    } else if (code === 10 || code === 13) {
      out += " ";
    } else if (code >= 32 && code <= 126) {
      out += char;
    } else if (code >= 160 && code <= 255) {
      out += String.fromCharCode(code);
    } else {
      out += "?";
    }
  }
  return out;
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export type CertificatePdfInput = {
  serial: string;
  learnerName: string;
  courseTitle: string;
  issuedAt: Date;
  verifyUrl: string;
};

function contentStream(input: CertificatePdfInput): string {
  const issued = formatDateLong(input.issuedAt);
  const titleLines = wrap(input.courseTitle, 42);
  const nameLines = wrap(input.learnerName, 36);

  const ops: string[] = [];
  const text = (size: number, x: number, y: number, value: string) => {
    ops.push(`BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };

  // Maroon header bar
  ops.push("0.533 0 0.125 rg");
  ops.push("0 540 792 72 re f");
  ops.push("1 1 1 rg");
  text(18, 48, 568, getSite().name);
  text(11, 48, 548, "Certificate of completion");

  ops.push("0.067 0.067 0.09 rg");
  text(12, 48, 480, "This certifies that");
  let y = 440;
  for (const line of nameLines) {
    text(24, 48, y, line);
    y -= 30;
  }
  text(12, 48, y - 8, "successfully completed");
  y -= 48;
  for (const line of titleLines) {
    text(18, 48, y, line);
    y -= 24;
  }
  text(12, 48, y - 16, `Issued ${issued}`);
  text(10, 48, 96, `Serial ${input.serial}`);
  text(9, 48, 76, `Verify at ${input.verifyUrl}`);

  return ops.join("\n");
}

function xrefTable(offsets: number[]): string {
  const lines = ["xref", `0 ${offsets.length + 1}`, "0000000000 65535 f "];
  for (const offset of offsets) {
    lines.push(`${String(offset).padStart(10, "0")} 00000 n `);
  }
  return lines.join("\n");
}

export function renderCertificatePdf(input: CertificatePdfInput): Uint8Array {
  const stream = contentStream(input);
  const streamBytes = Buffer.from(stream, "latin1");

  const objects: string[] = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${streamBytes.length} >> stream\n${stream}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];

  const header = "%PDF-1.4\n";
  const offsets: number[] = [];
  let body = header;
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += object + "\n";
  }
  const xrefStart = Buffer.byteLength(body, "latin1");
  body += xrefTable(offsets) + "\n";
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefStart}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, "latin1"));
}
