"use client";

import { useActionState, useState } from "react";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { approvePayment, rejectPayment, type ReviewState } from "./actions";

const initial: ReviewState = { status: "idle" };

/**
 * Approve enrols the learner at once. Reject opens a dialog that will not submit
 * without a reason, because the learner reads that reason on their receipt.
 */
export function ReviewForm({
  paymentId,
  summary,
  align = "end",
}: {
  paymentId: string;
  summary: string;
  align?: "start" | "end";
}) {
  const [approveState, approve, approving] = useActionState(approvePayment, initial);
  const [open, setOpen] = useState(false);
  // A successful reject revalidates the queue and this row leaves; close the
  // dialog with it so focus is not stranded in a dialog whose trigger is gone.
  const [rejectState, reject, rejecting] = useActionState(async (prev: ReviewState, formData: FormData) => {
    const result = await rejectPayment(prev, formData);
    if (result.status === "done") setOpen(false);
    return result;
  }, initial);

  const busy = approving || rejecting;

  return (
    <div className={cn("flex flex-col gap-1.5", align === "end" ? "items-end" : "items-start")}>
      <div className={cn("flex flex-wrap gap-2", align === "end" && "justify-end")}>
        <form action={approve}>
          <input type="hidden" name="paymentId" value={paymentId} />
          <Button type="submit" size="sm" disabled={busy}>
            {approving ? "Approving…" : "Approve and enrol"}
          </Button>
        </form>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="secondary" disabled={busy}>
              Reject
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form action={reject} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Reject this payment?</DialogTitle>
                <DialogDescription>{summary}</DialogDescription>
              </DialogHeader>
              <input type="hidden" name="paymentId" value={paymentId} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`reject-notes-${paymentId}`}>Reason for rejection</Label>
                <Textarea
                  id={`reject-notes-${paymentId}`}
                  name="notes"
                  required
                  rows={3}
                  maxLength={500}
                  aria-describedby={`reject-notes-hint-${paymentId}`}
                  placeholder="For example: no payment with this transaction ID reached our bKash account."
                />
                <p id={`reject-notes-hint-${paymentId}`} className="text-sm text-graphite">
                  The learner sees this reason on their receipt and in a notification.
                </p>
              </div>
              {rejectState.status === "error" ? <FieldError message={rejectState.message} /> : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={rejecting}>
                  {rejecting ? "Rejecting…" : "Reject payment"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {approveState.status === "error" ? <FieldError message={approveState.message} /> : null}
      {approveState.status === "done" || rejectState.status === "done" ? (
        <p role="status" className="text-sm font-medium text-ink">
          {approveState.status === "done" ? approveState.message : rejectState.status === "done" ? rejectState.message : ""}
        </p>
      ) : null}
    </div>
  );
}
