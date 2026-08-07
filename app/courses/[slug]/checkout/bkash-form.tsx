"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitBkashPayment, type SubmitState } from "./actions";

const initial: SubmitState = { status: "idle" };

export function BkashForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(submitBkashPayment, initial);

  if (state.status === "submitted") {
    return (
      <Alert role="status">
        <CircleCheck className="size-4 text-brand" />
        <AlertTitle>Payment submitted</AlertTitle>
        <AlertDescription>
          Your payment is awaiting verification. An admin will confirm it, usually within a few
          hours. You&rsquo;ll get access to the course as soon as it&rsquo;s approved.
        </AlertDescription>
      </Alert>
    );
  }

  const fieldError = (name: string) =>
    state.status === "error" ? state.fieldErrors?.[name]?.[0] : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />

      <p className="text-sm text-muted-foreground">
        Send the payment to our bKash number, then enter the details from your confirmation SMS
        below.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transactionId">bKash transaction ID</Label>
        <Input id="transactionId" name="transactionId" required autoComplete="off" />
        {fieldError("transactionId") ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {fieldError("transactionId")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phoneNumber">Your bKash number</Label>
        <Input
          id="phoneNumber"
          name="phoneNumber"
          required
          inputMode="numeric"
          placeholder="01712345678"
        />
        {fieldError("phoneNumber") ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {fieldError("phoneNumber")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paymentDate">Date of payment</Label>
        <Input id="paymentDate" name="paymentDate" type="date" required />
        {fieldError("paymentDate") ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {fieldError("paymentDate")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reference">Reference (optional)</Label>
        <Input id="reference" name="reference" autoComplete="off" />
      </div>

      {state.status === "error" && !state.fieldErrors ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="shadow-brand">
        {pending ? "Submitting…" : "Submit payment for verification"}
      </Button>
    </form>
  );
}
