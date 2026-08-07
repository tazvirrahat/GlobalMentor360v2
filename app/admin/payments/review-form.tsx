"use client";

import { useActionState } from "react";
import { approvePayment, rejectPayment, type ReviewState } from "./actions";

const initial: ReviewState = { status: "idle" };

export function ReviewForm({ paymentId }: { paymentId: string }) {
  const [approveState, approve, approving] = useActionState(approvePayment, initial);
  const [rejectState, reject, rejecting] = useActionState(rejectPayment, initial);

  const state = approveState.status !== "idle" ? approveState : rejectState;
  const busy = approving || rejecting;

  return (
    <div>
      <label htmlFor={`notes-${paymentId}`}>Notes</label>
      <input id={`notes-${paymentId}`} name="notes" form={`approve-${paymentId}`} />

      <form action={approve} id={`approve-${paymentId}`}>
        <input type="hidden" name="paymentId" value={paymentId} />
        <button type="submit" disabled={busy}>
          {approving ? "Approving…" : "Approve and enrol"}
        </button>
      </form>

      <form action={reject}>
        <input type="hidden" name="paymentId" value={paymentId} />
        <label htmlFor={`reject-notes-${paymentId}`}>Reason for rejection</label>
        <input id={`reject-notes-${paymentId}`} name="notes" />
        <button type="submit" disabled={busy}>
          {rejecting ? "Rejecting…" : "Reject"}
        </button>
      </form>

      {state.status !== "idle" ? <p role="status">{state.message}</p> : null}
    </div>
  );
}
