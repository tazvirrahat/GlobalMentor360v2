/**
 * One place that says what each status is called and which colour it wears.
 * Colours mean one thing each: verified = done or paid, caution =
 * pending or needs action, seal = failed or rejected, neutral = everything
 * that is simply over (refunded, unpublished).
 */
export type StatusKind = "course" | "order" | "payment" | "refund" | "video";
export type StatusTone = "verified" | "caution" | "seal" | "neutral";

const TABLE: Record<StatusKind, Record<string, readonly [label: string, tone: StatusTone]>> = {
  course: {
    DRAFT: ["Draft", "caution"],
    IN_REVIEW: ["In review", "caution"],
    PUBLISHED: ["Published", "verified"],
    UNPUBLISHED: ["Unpublished", "neutral"],
  },
  order: {
    PENDING: ["Awaiting payment", "caution"],
    PAID: ["Paid", "verified"],
    FAILED: ["Failed", "seal"],
    REFUNDED: ["Refunded", "neutral"],
    PARTIALLY_REFUNDED: ["Partly refunded", "neutral"],
  },
  payment: {
    PENDING: ["Not submitted", "neutral"],
    PENDING_VERIFICATION: ["Awaiting verification", "caution"],
    COMPLETED: ["Paid", "verified"],
    FAILED: ["Rejected", "seal"],
    REFUNDED: ["Refunded", "neutral"],
  },
  refund: {
    REQUESTED: ["Requested", "caution"],
    APPROVED: ["Approved", "caution"],
    REJECTED: ["Rejected", "seal"],
    PROCESSED: ["Refunded", "neutral"],
  },
  video: {
    UPLOADING: ["Uploading", "neutral"],
    PROCESSING: ["Processing", "caution"],
    READY: ["Ready", "verified"],
    FAILED: ["Failed", "seal"],
  },
};

function sentenceCase(status: string): string {
  const words = status.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function statusLabel(kind: StatusKind, status: string): string {
  return TABLE[kind][status]?.[0] ?? sentenceCase(status);
}

export function statusTone(kind: StatusKind, status: string): StatusTone {
  return TABLE[kind][status]?.[1] ?? "neutral";
}
