"use client";

import { useActionState, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";
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
        <CircleCheck className="size-4 text-brand" />
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

      {merchantNumber ? (
        <p className="text-sm text-muted-foreground">
          Send <strong className="text-brand">{amountLabel}</strong> to our bKash number{" "}
          <strong className="text-brand">{merchantNumber}</strong> (Send Money), then enter the
          details from your confirmation SMS.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Send <strong className="text-brand">{amountLabel}</strong> via bKash, then enter the
          details from your confirmation SMS. Our payment number will be shared by the academy —
          contact support if you don&rsquo;t have it yet.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transactionId">bKash transaction ID</Label>
        <Input id="transactionId" name="transactionId" autoComplete="off" />
        {fieldError("transactionId") ? (
          <FieldError message={fieldError("transactionId")!} />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phoneNumber">Your bKash number</Label>
        <Input
          id="phoneNumber"
          name="phoneNumber"
          inputMode="numeric"
          placeholder="01712345678"
        />
        {fieldError("phoneNumber") ? (
          <FieldError message={fieldError("phoneNumber")!} />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paymentDate">Date of payment</Label>
        <Input id="paymentDate" name="paymentDate" type="date" />
        {fieldError("paymentDate") ? (
          <FieldError message={fieldError("paymentDate")!} />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reference">Reference (optional)</Label>
        <Input id="reference" name="reference" autoComplete="off" />
      </div>

      {state.status === "error" && !state.fieldErrors ? (
        <FieldError message={state.message} />
      ) : null}

      <Button type="submit" disabled={pending} className="shadow-brand">
        {pending ? "Submitting…" : submitLabel}
      </Button>
    </form>
  );
}
