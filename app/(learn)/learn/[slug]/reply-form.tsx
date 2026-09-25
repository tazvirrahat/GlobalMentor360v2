"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// From lib/qa-rules, not lib/qa: this is a Client Component, and lib/qa reaches
// lib/db (see the note in lib/qa-rules.ts).
import { REPLY_BODY_MAX } from "@/lib/qa-rules";
import { FieldError } from "@/components/site/field-error";
import { replyAction, type QaState } from "./qa-actions";

const initial: QaState = { status: "idle" };

export function ReplyForm({ threadId, questionTitle }: { threadId: string; questionTitle: string }) {
  // One of these renders per thread on the page. A fixed id would repeat down
  // the list and point every <label for> at the first thread's textarea.
  const uid = useId();
  const [state, action, pending] = useActionState(replyAction, initial);

  const fieldError = state.status === "error" ? state.fieldErrors?.body?.[0] : undefined;

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="threadId" value={threadId} />

      <Label htmlFor={`${uid}-body`} className="sr-only">
        Reply to “{questionTitle}”
      </Label>
      <Textarea
        id={`${uid}-body`}
        name="body"
        rows={3}
        required
        maxLength={REPLY_BODY_MAX}
        placeholder="Write a reply…"
        aria-invalid={fieldError ? true : undefined}
      />

      {fieldError ? <FieldError message={fieldError} /> : null}

      {state.status === "error" && !state.fieldErrors ? (
        <FieldError message={state.message} />
      ) : null}

      {state.status === "posted" ? (
        <p role="status" className="text-sm font-medium text-ink">
          Reply posted.
        </p>
      ) : null}

      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Posting…" : "Post reply"}
      </Button>
    </form>
  );
}
