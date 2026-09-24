import { describe, expect, it } from "vitest";
import { statusLabel, statusTone } from "./status";

const cases: [Parameters<typeof statusTone>[0], string, string, string][] = [
  ["course", "DRAFT", "Draft", "caution"],
  ["course", "IN_REVIEW", "In review", "caution"],
  ["course", "PUBLISHED", "Published", "verified"],
  ["course", "UNPUBLISHED", "Unpublished", "neutral"],
  ["order", "PENDING", "Awaiting payment", "caution"],
  ["order", "PAID", "Paid", "verified"],
  ["order", "FAILED", "Failed", "seal"],
  ["order", "REFUNDED", "Refunded", "neutral"],
  ["order", "PARTIALLY_REFUNDED", "Partly refunded", "neutral"],
  ["payment", "PENDING", "Not submitted", "neutral"],
  ["payment", "PENDING_VERIFICATION", "Awaiting verification", "caution"],
  ["payment", "COMPLETED", "Paid", "verified"],
  ["payment", "FAILED", "Rejected", "seal"],
  ["payment", "REFUNDED", "Refunded", "neutral"],
  ["refund", "REQUESTED", "Requested", "caution"],
  ["refund", "APPROVED", "Approved", "caution"],
  ["refund", "REJECTED", "Rejected", "seal"],
  ["refund", "PROCESSED", "Refunded", "neutral"],
  ["video", "UPLOADING", "Uploading", "neutral"],
  ["video", "PROCESSING", "Processing", "caution"],
  ["video", "READY", "Ready", "verified"],
  ["video", "FAILED", "Failed", "seal"],
];

describe("status labels and tones", () => {
  for (const [kind, status, label, tone] of cases) {
    it(`${kind} ${status} → ${label} (${tone})`, () => {
      expect(statusLabel(kind, status)).toBe(label);
      expect(statusTone(kind, status)).toBe(tone);
    });
  }

  it("sentence-cases an unknown status and keeps it neutral", () => {
    expect(statusLabel("order", "SOMETHING_ELSE")).toBe("Something else");
    expect(statusTone("order", "SOMETHING_ELSE")).toBe("neutral");
  });
});
