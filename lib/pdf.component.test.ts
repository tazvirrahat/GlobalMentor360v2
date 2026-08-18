import { describe, expect, it } from "vitest";
import { renderCertificatePdf } from "./pdf";

describe("renderCertificatePdf extra cases", () => {
  it("returns bytes that start as PDF 1.4 and end at EOF", () => {
    const bytes = renderCertificatePdf({
      serial: "GM360-AAAA-BBBB-CCCC-DDDD",
      learnerName: "Sam",
      courseTitle: "Course",
      issuedAt: new Date("2026-08-17T00:00:00Z"),
      verifyUrl: "http://localhost:3000/certificates/GM360-AAAA-BBBB-CCCC-DDDD",
    });
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(200);
  });

  it("replaces characters outside Latin-1 so the content stream stays valid", () => {
    const bytes = renderCertificatePdf({
      serial: "GM360-TEST-TEST-TEST-TEST",
      learnerName: "李 Sam",
      courseTitle: "Курс",
      issuedAt: new Date("2026-01-01T00:00:00Z"),
      verifyUrl: "http://localhost:3000/certificates/x",
    });
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("? Sam");
    expect(text).not.toContain("李");
  });
});
