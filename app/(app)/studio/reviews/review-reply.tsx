"use client";

import { useActionState, useRef, useState } from "react";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_REPLY_MAX } from "@/lib/review-rules";
import { deleteReplyAction, saveReplyAction, type ReplyState } from "./actions";

const idle: ReplyState = { status: "idle" };

/**
 * Reply to one review: the form when there is no reply (or while editing),
 * otherwise the reply with Edit and Delete.
 */
export function ReviewReply({
  reviewId,
  authorName,
  reply,
}: {
  reviewId: string;
  authorName: string;
  reply: { body: string; dateLabel: string } | null;
}) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const [saved, save, saving] = useActionState(async (prev: ReplyState, formData: FormData) => {
    const result = await saveReplyAction(prev, formData);
    if (result.status === "done") setEditing(false);
    return result;
  }, idle);
  const [deleted, remove] = useActionState(deleteReplyAction, idle);
  const textareaId = `reply-${reviewId}`;
  const message = saved.status !== "idle" ? saved : deleted;

  if (reply && !editing) {
    return (
      <div className="flex flex-col gap-2 border-l-2 border-rule pl-4">
        <p className="text-sm text-graphite">
          <span className="font-semibold text-ink">Your reply</span> · {reply.dateLabel}
        </p>
        <p className="whitespace-pre-line text-ink">{reply.body}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button ref={editButton} type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit reply<span className="sr-only"> to {authorName}</span>
          </Button>
          <form action={remove}>
            <input type="hidden" name="reviewId" value={reviewId} />
            <ConfirmSubmit label={`Delete reply`} question="Delete your reply?" confirmLabel="Delete" variant="secondary" />
          </form>
        </div>
        {message.status === "done" ? (
          <p role="status" className="text-sm font-medium text-ink">
            {message.message}
          </p>
        ) : null}
        {message.status === "error" ? <FieldError message={message.message} /> : null}
      </div>
    );
  }

  return (
    <form action={save} className="flex flex-col gap-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <Label htmlFor={textareaId}>{reply ? "Edit your reply" : `Reply to ${authorName}`}</Label>
      <Textarea id={textareaId} name="body" rows={3} required maxLength={REVIEW_REPLY_MAX} defaultValue={reply?.body ?? ""} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : reply ? "Save reply" : "Post reply"}
        </Button>
        {reply ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
        {message.status === "done" ? (
          <p role="status" className="text-sm font-medium text-ink">
            {message.message}
          </p>
        ) : null}
      </div>
      {message.status === "error" ? <FieldError message={message.message} /> : null}
    </form>
  );
}
