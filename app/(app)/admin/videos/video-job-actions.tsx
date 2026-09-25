"use client";

import { useActionState } from "react";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { drainQueueAction, videoJobAction, type VideoJobState } from "./actions";

const idle: VideoJobState = { status: "idle" };

function Result({ state }: { state: VideoJobState }) {
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

/** A row's Retry (failed only) and Check status, sharing one message line. */
export function VideoJobActions({ assetId, label, canRetry }: { assetId: string; label: string; canRetry: boolean }) {
  const [state, action, pending] = useActionState(videoJobAction, idle);
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {canRetry ? (
          <form action={action}>
            <input type="hidden" name="assetId" value={assetId} />
            <input type="hidden" name="intent" value="retry" />
            <Button type="submit" size="sm" variant="secondary" disabled={pending} aria-label={`Retry processing ${label}`}>
              Retry
            </Button>
          </form>
        ) : null}
        <form action={action}>
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="intent" value="check" />
          <Button type="submit" size="sm" variant="ghost" disabled={pending} aria-label={`Check status of ${label}`}>
            Check status
          </Button>
        </form>
      </div>
      <div className="text-right">
        <Result state={state} />
      </div>
    </div>
  );
}

export function DrainNow() {
  const [state, action, pending] = useActionState(drainQueueAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Reading the queue…" : "Drain now"}
      </Button>
      <Result state={state} />
    </form>
  );
}
