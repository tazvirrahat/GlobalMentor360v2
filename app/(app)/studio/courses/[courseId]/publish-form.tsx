"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { setPublished, type ActionState } from "../../actions";

const initial: ActionState = { status: "idle" };

/** Publish when every check passes; unpublishing asks first (it hides the course from the catalog). */
export function PublishForm({ courseId, status, ready }: { courseId: string; status: string; ready: boolean }) {
  const [state, action, pending] = useActionState(setPublished, initial);
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
          {pending ? "Publishing…" : "Publish course"}
        </Button>
      )}

      {!published && !ready ? (
        <p className="text-sm text-graphite">Finish the checklist above to publish.</p>
      ) : null}
      {state.status === "error" ? <FieldError message={state.message} /> : null}
      {state.status === "done" ? (
        <p role="status" className="text-sm font-medium text-ink">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
