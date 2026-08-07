"use client";

import { useActionState } from "react";
import { submitBkashPayment, type SubmitState } from "./actions";

const initial: SubmitState = { status: "idle" };

export function BkashForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(submitBkashPayment, initial);

  if (state.status === "submitted") {
    return (
      <div role="status">
        <h2>Payment submitted</h2>
        <p>
          Your payment is awaiting verification. An admin will confirm it, usually within a few
          hours. You&rsquo;ll get access to the course as soon as it&rsquo;s approved.
        </p>
      </div>
    );
  }

  const fieldError = (name: string) =>
    state.status === "error" ? state.fieldErrors?.[name]?.[0] : undefined;

  return (
    <form action={action}>
      <input type="hidden" name="courseId" value={courseId} />

      <p>
        Send the payment to our bKash number, then enter the details from your confirmation SMS
        below.
      </p>

      <label htmlFor="transactionId">bKash transaction ID</label>
      <input id="transactionId" name="transactionId" required autoComplete="off" />
      {fieldError("transactionId") ? <p role="alert">{fieldError("transactionId")}</p> : null}

      <label htmlFor="phoneNumber">Your bKash number</label>
      <input
        id="phoneNumber"
        name="phoneNumber"
        required
        inputMode="numeric"
        placeholder="01712345678"
      />
      {fieldError("phoneNumber") ? <p role="alert">{fieldError("phoneNumber")}</p> : null}

      <label htmlFor="paymentDate">Date of payment</label>
      <input id="paymentDate" name="paymentDate" type="date" required />
      {fieldError("paymentDate") ? <p role="alert">{fieldError("paymentDate")}</p> : null}

      <label htmlFor="reference">Reference (optional)</label>
      <input id="reference" name="reference" autoComplete="off" />

      {state.status === "error" && !state.fieldErrors ? (
        <p role="alert">{state.message}</p>
      ) : null}

      <button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit payment for verification"}
      </button>
    </form>
  );
}
