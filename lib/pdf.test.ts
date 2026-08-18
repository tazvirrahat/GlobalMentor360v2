import { describe, expect, it } from "vitest";
import { renderCertificatePdf } from "./pdf";

describe("renderCertificatePdf", () => {
  it("produces a PDF with the serial and learner name", () => {
    const bytes = renderCertificatePdf({
      serial: "GM360-AAAA-BBBB-CCCC-DDDD",
      learnerName: "Sam Learner",
      courseTitle: "TypeScript Foundations",
      issuedAt: new Date("2026-08-17T00:00:00Z"),
      verifyUrl: "http://localhost:3000/certificates/GM360-AAAA-BBBB-CCCC-DDDD",
    });

    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text).toContain("GM360-AAAA-BBBB-CCCC-DDDD");
    expect(text).toContain("Sam Learner");
    expect(text).toContain("TypeScript Foundations");
  });

  it("escapes parentheses in names so the content stream stays valid", () => {
    const bytes = renderCertificatePdf({
      serial: "GM360-TEST-TEST-TEST-TEST",
      learnerName: "Sam (Learner)",
      courseTitle: "Course",
      issuedAt: new Date("2026-01-01T00:00:00Z"),
      verifyUrl: "http://localhost:3000/certificates/x",
    });
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("Sam \\(Learner\\)");
  });
});
