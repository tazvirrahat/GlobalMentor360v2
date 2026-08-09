"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitReview, type ReviewState } from "./review-action";

const initial: ReviewState = { status: "idle" };

/** Five, because a review carries a 1-5 rating — see `isValidRating` in lib/reviews.ts. */
const STARS = [1, 2, 3, 4, 5];

export type ReviewFormProps = {
  courseId: string;
  /** The learner's existing review, when they are editing rather than writing. */
  existing: { rating: number; body: string | null } | null;
};

export function ReviewForm({ courseId, existing }: ReviewFormProps) {
  const [state, action, pending] = useActionState(submitReview, initial);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hovered, setHovered] = useState(0);

  const lit = hovered || rating;
  const fieldError = (name: string) =>
    state.status === "error" ? state.fieldErrors?.[name]?.[0] : undefined;

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border p-5">
      <input type="hidden" name="courseId" value={courseId} />

      <div className="flex flex-col gap-1.5">
        <h3 className="font-bold">{existing ? "Edit your review" : "Write a review"}</h3>
        <p className="text-sm text-muted-foreground">
          Only learners enrolled in this course can review it.
        </p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Your rating</legend>
        {/* Real radios rather than buttons: they carry the value without
            JavaScript, and arrow keys move between them for free. */}
        <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
          {STARS.map((star) => (
            <label
              key={star}
              className="cursor-pointer p-0.5"
              onMouseEnter={() => setHovered(star)}
            >
              <input
                type="radio"
                name="rating"
                value={star}
                required
                checked={rating === star}
                onChange={() => setRating(star)}
                className="peer sr-only"
              />
              <Star
                aria-hidden
                className={cn(
                  "size-7 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  star <= lit ? "fill-current text-amber-600" : "text-muted-foreground/40",
                )}
              />
              <span className="sr-only">
                {star} star{star === 1 ? "" : "s"}
              </span>
            </label>
          ))}
        </div>
        {fieldError("rating") ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {fieldError("rating")}
          </p>
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
        />
        {fieldError("body") ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {fieldError("body")}
          </p>
        ) : null}
      </div>

      {state.status === "error" && !state.fieldErrors ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      {state.status === "saved" ? (
        <p role="status" className="text-sm font-medium text-brand">
          Thanks — your review is live.
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-fit shadow-brand">
        {pending ? "Saving…" : existing ? "Update review" : "Post review"}
      </Button>
    </form>
  );
}
