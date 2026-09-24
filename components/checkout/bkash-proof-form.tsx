"use client";

import { useActionState, type ReactNode } from "react";
import { CircleCheck, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/site/field-error";

export type BkashProofState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "submitted" };

const initial: BkashProofState = { status: "idle" };

export function BkashProofForm({
  action,
  hiddenFields,
  submitLabel = "Submit payment for verification",
  amountLabel,
  merchantNumber,
  successDescription,
}: {
  action: (prev: BkashProofState, formData: FormData) => Promise<BkashProofState>;
  hiddenFields?: ReactNode;
  submitLabel?: string;
  amountLabel: string;
  /** From BKASH_MERCHANT_NUMBER — null until the academy configures one. */
  merchantNumber: string | null;
  successDescription: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  if (state.status === "submitted") {
    return (
      <Alert role="status">
        <CircleCheck className="size-4 text-primary" />
        <AlertTitle>Payment submitted</AlertTitle>
        <AlertDescription>{successDescription}</AlertDescription>
      </Alert>
    );
  }

  const fieldError = (name: string) =>
    state.status === "error" ? state.fieldErrors?.[name]?.[0] : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hiddenFields}

      <div className="rounded-lg border bg-muted/40 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          How to pay
        </p>
        <ol className="mt-3 flex flex-col gap-3 text-sm">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-xs font-semibold text-primary">
              1
            </span>
            <span className="min-w-0 text-muted-foreground">
              Open bKash and choose Send Money.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-xs font-semibold text-primary">
              2
            </span>
            {merchantNumber ? (
              <span className="min-w-0 text-muted-foreground">
                Send <strong className="text-foreground">{amountLabel}</strong> to our bKash number{" "}
                <strong className="font-heading text-xl font-semibold tabular-nums tracking-wide text-primary">
                  {merchantNumber}
                </strong>
                .
              </span>
            ) : (
              <span className="min-w-0 text-muted-foreground">
                Send <strong className="text-foreground">{amountLabel}</strong> via bKash. Our
                payment number will be shared by the academy — contact support if you don&rsquo;t
                have it yet.
              </span>
            )}
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-xs font-semibold text-primary">
              3
            </span>
            <span className="min-w-0 text-muted-foreground">
              Enter the details from your confirmation SMS below.
            </span>
          </li>
        </ol>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transactionId">bKash transaction ID</Label>
        <Input
          id="transactionId"
          name="transactionId"
          autoComplete="off"
          aria-invalid={fieldError("transactionId") ? true : undefined}
          aria-describedby={fieldError("transactionId") ? "bkash-transactionId-error" : undefined}
        />
        {fieldError("transactionId") ? (
          <FieldError id="bkash-transactionId-error" message={fieldError("transactionId")!} />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phoneNumber">Your bKash number</Label>
        <Input
          id="phoneNumber"
          name="phoneNumber"
          inputMode="numeric"
          placeholder="01712345678"
          aria-invalid={fieldError("phoneNumber") ? true : undefined}
          aria-describedby={fieldError("phoneNumber") ? "bkash-phoneNumber-error" : undefined}
        />
        {fieldError("phoneNumber") ? (
          <FieldError id="bkash-phoneNumber-error" message={fieldError("phoneNumber")!} />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paymentDate">Date of payment</Label>
        <Input
          id="paymentDate"
          name="paymentDate"
          type="date"
          aria-invalid={fieldError("paymentDate") ? true : undefined}
          aria-describedby={fieldError("paymentDate") ? "bkash-paymentDate-error" : undefined}
        />
        {fieldError("paymentDate") ? (
          <FieldError id="bkash-paymentDate-error" message={fieldError("paymentDate")!} />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reference">Reference (optional)</Label>
        <Input id="reference" name="reference" autoComplete="off" />
      </div>

      {state.status === "error" && !state.fieldErrors ? (
        <FieldError message={state.message} />
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : submitLabel}
      </Button>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
        Access unlocks after an admin confirms the transfer.
      </p>
    </form>
  );
}
