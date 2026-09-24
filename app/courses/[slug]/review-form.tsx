"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OwnReview } from "@/lib/reviews";
import { cn } from "@/lib/utils";
import { FieldError } from "@/components/site/field-error";
import { submitReview, type ReviewState } from "./review-action";

const initial: ReviewState = { status: "idle" };

/** Five, because a review carries a 1-5 rating — see `isValidRating` in lib/reviews.ts. */
const STARS = [1, 2, 3, 4, 5];

/**
 * What a learner is told when their own review is not on the page.
 *
 * Only VISIBLE reviews are listed, so anything else means the learner is looking
 * for a review that is not there. Saying nothing leaves them to conclude the post
 * failed and write it again; `saveReview` deliberately does not reset `status` on
 * an edit, so the second attempt would vanish exactly like the first.
 */
const MODERATION_NOTICE: Partial<Record<OwnReview["status"], string>> = {
  PENDING: "Your review is waiting on moderation, so it is not shown below yet.",
  HIDDEN:
    "A moderator has hidden your review, so it is not shown below. Editing it will not restore it.",
};

export type ReviewFormProps = {
  courseId: string;
  /** The learner's existing review, when they are editing rather than writing. */
  existing: OwnReview | null;
};

export function ReviewForm({ courseId, existing }: ReviewFormProps) {
  const [state, action, pending] = useActionState(submitReview, initial);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hovered, setHovered] = useState(0);

  const lit = hovered || rating;
  const fieldError = (name: string) =>
    state.status === "error" ? state.fieldErrors?.[name]?.[0] : undefined;

  // A first review is created VISIBLE, so no existing row means the save really
  // does go live. Anything else is whatever the row already carried.
  const notice = existing ? MODERATION_NOTICE[existing.status] : undefined;

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm">
      <input type="hidden" name="courseId" value={courseId} />

      <div className="flex flex-col gap-1.5">
        <h3 className="font-heading font-semibold tracking-tight">{existing ? "Edit your review" : "Write a review"}</h3>
        <p className="text-sm text-muted-foreground">
          Only learners enrolled in this course can review it.
        </p>
      </div>

      {notice ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          {notice}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Your rating</legend>
        {/* Real radios rather than buttons: they carry the value without
            JavaScript, and arrow keys move between them for free. */}
        <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
          {STARS.map((star) => (
              <label
              key={star}
              className="flex size-11 cursor-pointer items-center justify-center"
              onMouseEnter={() => setHovered(star)}
            >
              <input
                type="radio"
                name="rating"
                value={star}
                required
                checked={rating === star}
                onChange={() => setRating(star)}
                // On the inputs rather than the fieldset: a description hung off
                // a fieldset is not reliably announced, and the radio is what
                // has focus when the learner needs to hear why it was refused.
                // No aria-invalid to go with it — ARIA does not support it on
                // role=radio, only on the radiogroup, and this fieldset is not
                // one.
                aria-describedby={fieldError("rating") ? "review-rating-error" : undefined}
                className="peer sr-only"
              />
              <Star
                aria-hidden
                className={cn(
                  "size-7 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  star <= lit ? "fill-current text-star" : "text-muted-foreground/40",
                )}
              />
              <span className="sr-only">
                {star} star{star === 1 ? "" : "s"}
              </span>
            </label>
          ))}
        </div>
        {fieldError("rating") ? (
          <FieldError id="review-rating-error" message={fieldError("rating")!} />
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-body">Your review (optional)</Label>
        <Textarea
          id="review-body"
          name="body"
          rows={4}
          maxLength={4000}
          defaultValue={existing?.body ?? ""}
          placeholder="What did this course get right? What would you tell someone considering it?"
          aria-invalid={fieldError("body") ? true : undefined}
          aria-describedby={fieldError("body") ? "review-body-error" : undefined}
        />
        {fieldError("body") ? (
          <FieldError id="review-body-error" message={fieldError("body")!} />
        ) : null}
      </div>

      {state.status === "error" && !state.fieldErrors ? (
        <FieldError message={state.message} />
      ) : null}

      {state.status === "saved" ? (
        <p role="status" className="text-sm font-medium text-primary">
          {notice ? "Saved. Your review is still not shown below." : "Thanks — your review is live."}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : existing ? "Update review" : "Post review"}
      </Button>
    </form>
  );
}
