import type { PaymentMethod } from "@/generated/prisma/enums";

/**
 * The seam between checkout and however money actually arrives.
 *
 * Two rails exist and they are genuinely different shapes, so this is a
 * discriminated union rather than one interface with half the methods optional:
 *
 *   automatic — the provider takes the money inside our checkout and tells us it
 *               succeeded. Access is instant. No human involved.
 *   manual    — the learner pays out-of-band and submits proof. Access waits for
 *               an admin to approve. There is an inbox.
 *
 * Today only ManualBkashRail exists. There is deliberately no stub for the bKash
 * PGW API: an empty class that looks implemented is exactly the failure mode
 * recorded in docs/PRIOR-ART.md, where the prior codebase shipped a payment
 * service returning 'mock_client_secret'. When merchant credentials arrive, add a
 * real AutomaticRail — everything below is shaped to receive it.
 */

export type RailKind = "automatic" | "manual";

interface BaseRail {
  readonly id: string;
  readonly method: PaymentMethod;
  readonly kind: RailKind;
  /** Rails settle in one currency; a course without a price in it can't use the rail. */
  readonly currency: string;
  readonly label: string;
  /** False when credentials are missing, so checkout can hide the option rather than fail on submit. */
  isConfigured(): boolean;
}

export interface BeginManualInput {
  userId: string;
  /** Single-course checkout. Ignored when `items` is provided. */
  courseId?: string;
  /** Multi-item checkout. Each unitPrice is already read from Price (invariant 6). */
  items?: { courseId: string; unitPrice: number; discountApplied?: number }[];
  amount: number;
  discount?: number;
  couponId?: string | null;
  /** Rail-specific proof the learner typed in. */
  proof: Record<string, string | null>;
}

export interface ManualRail extends BaseRail {
  readonly kind: "manual";
  /**
   * Records the learner's claim that they paid. Must NOT grant access — that is
   * what approval is for.
   */
  submitProof(input: BeginManualInput): Promise<{ paymentId: string }>;
}

export interface AutomaticRail extends BaseRail {
  readonly kind: "automatic";
  /** Returns where to send the learner to pay. */
  createSession(input: {
    userId: string;
    courseId: string;
    amount: number;
    returnUrl: string;
  }): Promise<{ redirectUrl: string; providerRef: string }>;

  /**
   * Verifies a provider callback and reports whether the money actually landed.
   * Must verify a signature or re-query the provider — never trust the browser.
   *
   * `paid: true` means the session is (or already was) a successful charge.
   * `retry: true` means fulfill did not run and the row is not in a terminal
   * state — the HTTP handler must not ACK, so the provider retries.
   */
  confirm(payload: {
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<{ paid: boolean; providerRef: string; retry?: boolean } | null>;
}

export type PaymentRail = ManualRail | AutomaticRail;

export function isManual(rail: PaymentRail): rail is ManualRail {
  return rail.kind === "manual";
}
