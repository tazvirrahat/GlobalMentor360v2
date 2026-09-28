"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { setPublished, withdrawFromReview, type ActionState } from "../../actions";

const initial: ActionState = { status: "idle" };

function Result({ state }: { state: ActionState }) {
  if (state.status === "error") return <FieldError message={state.message} />;
  if (state.status === "done") {
    return (
      <p role="status" className="text-sm font-medium text-ink">
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * The Publish tab's one action, which depends on where the course is:
 * live → Unpublish (asks first); waiting for review → Withdraw; otherwise
 * Publish (admins) or Submit for review (instructors), once the checklist passes.
 */
export function PublishForm({
  courseId,
  status,
  ready,
  canPublishDirectly,
  reviewRequestedLabel,
}: {
  courseId: string;
  status: string;
  ready: boolean;
  canPublishDirectly: boolean;
  reviewRequestedLabel: string | null;
}) {
  const [state, action, pending] = useActionState(setPublished, initial);
  const [withdrawState, withdraw, withdrawing] = useActionState(withdrawFromReview, initial);

  if (status === "IN_REVIEW") {
    return (
      <form action={withdraw} className="flex flex-col items-start gap-2">
        <input type="hidden" name="courseId" value={courseId} />
        <p className="text-ink">
          Waiting for review{reviewRequestedLabel ? ` since ${reviewRequestedLabel}` : ""}. You&apos;ll get a notification
          when it&apos;s approved or returned.
        </p>
        <Button type="submit" variant="secondary" disabled={withdrawing}>
          {withdrawing ? "Withdrawing…" : "Withdraw from review"}
        </Button>
        {/* The submit that just moved it here keeps its confirmation. */}
        {withdrawState.status === "idle" ? <Result state={state} /> : <Result state={withdrawState} />}
      </form>
    );
  }

  const published = status === "PUBLISHED";

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="publish" value={published ? "false" : "true"} />

      {published ? (
        <ConfirmSubmit
          label="Unpublish"
          question="Hide this course from the catalog? Enrolled learners keep access."
          confirmLabel={pending ? "Unpublishing…" : "Unpublish"}
          size="default"
          variant="secondary"
        />
      ) : (
        <Button type="submit" size="lg" disabled={pending || !ready}>
          {canPublishDirectly
            ? pending
              ? "Publishing…"
              : "Publish course"
            : pending
              ? "Submitting…"
              : "Submit for review"}
        </Button>
      )}

      {!published && !ready ? <p className="text-sm text-graphite">Finish the checklist above first.</p> : null}
      {!published && ready && !canPublishDirectly ? (
        <p className="text-sm text-graphite">An admin checks the course, then it goes live.</p>
      ) : null}
      <Result state={state} />
    </form>
  );
}
