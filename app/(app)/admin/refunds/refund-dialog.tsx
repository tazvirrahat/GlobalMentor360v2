"use client";

import { useFormStatus } from "react-dom";
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
import { refundOrderAction } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Refunding…" : "Refund and revoke access"}
    </Button>
  );
}

/**
 * Refunding removes the learner's access at once and cannot be undone from
 * here, so it happens in a dialog that asks for the reason first. The money
 * itself goes back through Stripe or bKash, by hand.
 */
export function RefundDialog({ orderId, summary, learner }: { orderId: string; summary: string; learner: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="secondary">
          Refund<span className="sr-only"> {learner}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={refundOrderAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Refund this order?</DialogTitle>
            <DialogDescription>
              {summary} The learner loses access to the course straight away. Send the money back through Stripe or
              bKash yourself; this only records the refund.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="orderId" value={orderId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reason-${orderId}`}>Reason</Label>
            <Textarea id={`reason-${orderId}`} name="reason" required maxLength={200} rows={2} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
