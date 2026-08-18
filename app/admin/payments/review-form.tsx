"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { approvePayment, rejectPayment, type ReviewState } from "./actions";

const initial: ReviewState = { status: "idle" };

export function ReviewForm({ paymentId }: { paymentId: string }) {
  const [approveState, approve, approving] = useActionState(approvePayment, initial);
  const [rejectState, reject, rejecting] = useActionState(rejectPayment, initial);

  const state = approveState.status !== "idle" ? approveState : rejectState;
  const busy = approving || rejecting;

  return (
    <div className="flex flex-col gap-3">
      <Separator />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`notes-${paymentId}`}>Notes</Label>
        <Input id={`notes-${paymentId}`} name="notes" form={`approve-${paymentId}`} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form action={approve} id={`approve-${paymentId}`}>
          <input type="hidden" name="paymentId" value={paymentId} />
          <Button type="submit" disabled={busy} className="shadow-brand">
            {approving ? "Approving…" : "Approve and enrol"}
          </Button>
        </form>

        <form action={reject} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="paymentId" value={paymentId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reject-notes-${paymentId}`}>Reason for rejection</Label>
            <Input
              id={`reject-notes-${paymentId}`}
              name="notes"
              required
              aria-required="true"
              aria-describedby={`reject-notes-hint-${paymentId}`}
              autoComplete="off"
            />
            <p id={`reject-notes-hint-${paymentId}`} className="text-xs text-muted-foreground">
              Required on the payment record for staff. It is not shown on the learner
              receipt.
            </p>
          </div>
          <Button type="submit" variant="destructive" disabled={busy}>
            {rejecting ? "Rejecting…" : "Reject"}
          </Button>
        </form>
      </div>

      {state.status !== "idle" ? (
        <p role="status" className="text-sm font-medium">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
