"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REPLY_BODY_MAX } from "@/lib/qa-rules";
import { replyFromInbox, type InboxReplyState } from "./actions";

const initial: InboxReplyState = { status: "idle" };

/**
 * One of these renders per thread in the list, so every id is scoped with
 * useId(). Fixed ids would make every label point at the first form's textarea —
 * a bug this repo has already shipped once, in the quiz builder.
 */
export function InboxReplyForm({ threadId, title }: { threadId: string; title: string }) {
  const uid = useId();
  const [state, action, pending] = useActionState(replyFromInbox, initial);

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="threadId" value={threadId} />

      <Label htmlFor={`reply-${uid}`} className="sr-only">
        Reply to “{title}”
      </Label>
      <Textarea
        id={`reply-${uid}`}
        name="body"
        rows={3}
        required
        minLength={2}
        maxLength={REPLY_BODY_MAX}
        placeholder="Answer this question…"
      />

      {state.status !== "idle" ? (
        <p
          role="status"
          className={
            state.status === "error"
              ? "text-sm font-medium text-destructive"
              : "text-sm font-medium text-brand"
          }
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Replying…" : "Reply"}
      </Button>
    </form>
  );
}
