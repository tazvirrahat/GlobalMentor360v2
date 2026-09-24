"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/site/field-error";
import { approvePayment, rejectPayment, type ReviewState } from "./actions";

const initial: ReviewState = { status: "idle" };

export function ReviewForm({ paymentId }: { paymentId: string }) {
  const [approveState, approve, approving] = useActionState(approvePayment, initial);
  const [rejectState, reject, rejecting] = useActionState(rejectPayment, initial);

  const state = approveState.status !== "idle" ? approveState : rejectState;
  const busy = approving || rejecting;

  return (
    <div className="flex items-center gap-2">
      <Input
        id={`notes-${paymentId}`}
        name="notes"
        form={`approve-${paymentId}`}
        placeholder="Notes"
        aria-label="Notes"
        className="h-8 w-24"
      />
      <form action={approve} id={`approve-${paymentId}`} className="shrink-0">
        <input type="hidden" name="paymentId" value={paymentId} />
        <Button type="submit" size="sm" disabled={busy}>
          {approving ? "Approving…" : "Approve and enrol"}
        </Button>
      </form>
      <form action={reject} className="flex shrink-0 items-center gap-2">
        <input type="hidden" name="paymentId" value={paymentId} />
        <Input
          id={`reject-notes-${paymentId}`}
          name="notes"
          required
          aria-required="true"
          aria-label="Reason for rejection"
          aria-describedby={`reject-notes-hint-${paymentId}`}
          autoComplete="off"
          placeholder="Reason for rejection"
          className="h-8 w-36"
        />
        <Button type="submit" size="sm" variant="destructive" disabled={busy}>
          {rejecting ? "Rejecting…" : "Reject"}
        </Button>
      </form>
      <p
        id={`reject-notes-hint-${paymentId}`}
        className="shrink-0 text-xs text-graphite sm:whitespace-nowrap"
      >
        The learner sees this reason on their receipt and in a notification.
      </p>
      {state.status === "error" ? <FieldError message={state.message} /> : null}
      {state.status === "done" ? (
        <p role="status" className="text-sm font-medium">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
