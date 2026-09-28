"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Hourglass } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BkashSubmitState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "submitted" };

const initial: BkashSubmitState = { status: "idle" };

/** One step of the checkout sequence. The numbers are information here: it is a sequence. */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const headingId = `checkout-step-${n}`;
  return (
    <li className="relative flex gap-4">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white"
      >
        {n}
      </span>
      <section aria-labelledby={headingId} className="flex min-w-0 flex-1 flex-col gap-4 pb-8">
        <h2 id={headingId} className="pt-0.5 text-xl font-semibold">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h2>
        {children}
      </section>
    </li>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(describedBy)}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-graphite">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-seal">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The bKash checkout as the sequence it is: 1 review the order,
 * 2 send the money, 3 submit the transaction ID. After a successful submit the
 * steps give way to the pending notice. A coupon that covers the whole price
 * skips step 2 and enrols straight away.
 */
export function BkashCheckout({
  action,
  review,
  amount,
  amountText,
  merchantNumber,
  hiddenFields,
  today,
  zeroTotal,
}: {
  action: (prev: BkashSubmitState, formData: FormData) => Promise<BkashSubmitState>;
  /** Step 1's content, rendered on the server. */
  review: ReactNode;
  /** The amount to send, as a Price element. */
  amount: ReactNode;
  /** The same amount as text, for sentences. */
  amountText: string;
  /** From BKASH_MERCHANT_NUMBER; null until the academy configures one. */
  merchantNumber: string | null;
  hiddenFields?: ReactNode;
  /** YYYY-MM-DD in the storefront's time zone, for the date field. */
  today: string;
  zeroTotal: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const fieldError = (name: string) => (state.status === "error" ? state.fieldErrors?.[name]?.[0] : undefined);
  const formError = state.status === "error" && !state.fieldErrors ? state.message : null;

  useEffect(() => {
    if (state.status !== "error") return;
    // Move focus to the first field that needs fixing, or to the message.
    const name = ["transactionId", "phoneNumber", "paymentDate"].find((key) => state.fieldErrors?.[key]);
    const target = name ? document.getElementById(`bkash-${name}`) : errorRef.current;
    // Centre it so its label is not under the sticky top bar (WCAG 2.4.11).
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center" });
  }, [state]);

  if (state.status === "submitted") {
    return (
      <Alert role="status" variant="caution">
        <Hourglass className="size-4" />
        <AlertTitle>Payment submitted, awaiting verification</AlertTitle>
        <AlertDescription>
          <p>
            We check your bKash transaction and open the course as soon as it is confirmed. You will get a
            notification, and the receipt will be in Orders.
          </p>
          <Button asChild variant="secondary" size="sm" className="mt-2">
            <Link href={"/orders" as Route}>View your orders</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <ol className="flex flex-col">
      <Step n={1} title="Review your order">
        {review}
      </Step>

      {zeroTotal ? (
        <Step n={2} title="Enrol with your coupon">
          <form action={formAction} className="flex flex-col gap-3">
            {hiddenFields}
            <p>Your coupon covers the full price, so there is nothing to send.</p>
            {formError ? (
              <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm font-medium text-seal outline-none">
                {formError}
              </p>
            ) : null}
            <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={pending}>
              {pending ? "Enrolling…" : "Enrol with coupon"}
            </Button>
          </form>
        </Step>
      ) : (
        <>
          <Step n={2} title="Pay with bKash">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-graphite">Send exactly</p>
              <p className="text-3xl font-bold text-ink">{amount}</p>
            </div>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base">
              <li>Open bKash and choose Send Money.</li>
              {merchantNumber ? (
                <li>
                  Send <strong>{amountText}</strong> to our bKash number{" "}
                  <strong className="text-lg tabular-nums">{merchantNumber}</strong>.
                </li>
              ) : (
                <li>
                  Send <strong>{amountText}</strong> via bKash. Our bKash number isn&rsquo;t on this page yet, so
                  contact support for it before you send.
                </li>
              )}
              <li>Keep the confirmation SMS: it has the transaction ID you need next.</li>
            </ul>
          </Step>

          <Step n={3} title="Submit your transaction ID">
            <form action={formAction} className="flex flex-col gap-4" noValidate>
              {hiddenFields}
              <Field
                id="bkash-transactionId"
                label="bKash transaction ID"
                hint="From your bKash confirmation SMS."
                error={fieldError("transactionId")}
              >
                {(describedBy) => (
                  <Input
                    id="bkash-transactionId"
                    name="transactionId"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                    className="font-mono text-base uppercase sm:max-w-72"
                    aria-invalid={fieldError("transactionId") ? true : undefined}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
              <Field
                id="bkash-phoneNumber"
                label="Your bKash number"
                hint="The 11-digit number you sent from, for example 01712345678."
                error={fieldError("phoneNumber")}
              >
                {(describedBy) => (
                  <Input
                    id="bkash-phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    required
                    className="sm:max-w-72"
                    aria-invalid={fieldError("phoneNumber") ? true : undefined}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
              <Field id="bkash-paymentDate" label="Date of payment" error={fieldError("paymentDate")}>
                {(describedBy) => (
                  <Input
                    id="bkash-paymentDate"
                    name="paymentDate"
                    type="date"
                    defaultValue={today}
                    max={today}
                    required
                    className="sm:max-w-56"
                    aria-invalid={fieldError("paymentDate") ? true : undefined}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
              <Field id="bkash-reference" label="Reference (optional)" hint="Only if you typed one in bKash.">
                {(describedBy) => (
                  <Input
                    id="bkash-reference"
                    name="reference"
                    autoComplete="off"
                    className="sm:max-w-72"
                    aria-describedby={describedBy}
                  />
                )}
              </Field>

              {formError ? (
                <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm font-medium text-seal outline-none">
                  {formError}
                </p>
              ) : state.status === "error" ? (
                <p role="alert" className="text-sm font-medium text-seal">
                  Fix the fields marked above, then submit again.
                </p>
              ) : null}

              <div className="flex flex-col gap-2">
                <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={pending}>
                  {pending ? "Submitting…" : "Submit transaction ID"}
                </Button>
                <p className="text-sm text-graphite">The course opens once we have confirmed the payment.</p>
              </div>
            </form>
          </Step>
        </>
      )}
    </ol>
  );
}
