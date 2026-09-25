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
import { approveReviewAction, returnReviewAction } from "../actions";

function Submit({ children, pendingLabel, variant = "default" }: { children: string; pendingLabel: string; variant?: "default" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Approve publishes at once; Return asks for the note the instructor will read. */
export function ReviewActions({ courseId, title }: { courseId: string; title: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <form action={approveReviewAction}>
        <input type="hidden" name="courseId" value={courseId} />
        <Submit pendingLabel="Publishing…">Approve and publish</Submit>
      </form>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="secondary">
            Return<span className="sr-only"> {title}</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form action={returnReviewAction} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Return this course?</DialogTitle>
              <DialogDescription>
                “{title}” goes back to its instructor as a draft, with your note on its Publish tab.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="courseId" value={courseId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`return-note-${courseId}`}>What needs to change</Label>
              <Textarea id={`return-note-${courseId}`} name="note" required maxLength={1000} rows={4} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
              <Submit pendingLabel="Returning…">Return with note</Submit>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
