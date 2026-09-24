"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// From lib/qa-rules, not lib/qa: this is a Client Component, and lib/qa reaches
// lib/db (see the note in lib/qa-rules.ts).
import { QUESTION_BODY_MAX, QUESTION_TITLE_MAX } from "@/lib/qa-rules";
import { FieldError } from "@/components/site/field-error";
import { askQuestionAction, type QaState } from "./qa-actions";

const initial: QaState = { status: "idle" };

export function AskQuestionForm({
  courseId,
  curriculumItemId,
  lectureTitle,
}: {
  courseId: string;
  curriculumItemId: string;
  lectureTitle: string;
}) {
  const uid = useId();
  const [state, action, pending] = useActionState(askQuestionAction, initial);

  const fieldError = (name: string) =>
    state.status === "error" ? state.fieldErrors?.[name]?.[0] : undefined;

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-xs">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="curriculumItemId" value={curriculumItemId} />

      <div className="flex flex-col gap-1.5">
        <h3 className="font-heading font-semibold tracking-tight">Ask a question</h3>
        <p className="text-sm text-muted-foreground">
          Your question is visible to everyone taking this course.
        </p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">What is it about?</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              value="LECTURE"
              defaultChecked
              className="size-4 cursor-pointer accent-primary"
            />
            This lecture ({lectureTitle})
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="scope" value="COURSE" className="size-4 cursor-pointer accent-primary" />
            The whole course
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-title`}>Title</Label>
        <Input
          id={`${uid}-title`}
          name="title"
          required
          maxLength={QUESTION_TITLE_MAX}
          placeholder="What are you stuck on?"
          aria-invalid={fieldError("title") ? true : undefined}
        />
        {fieldError("title") ? <FieldError message={fieldError("title")!} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-body`}>Details</Label>
        <Textarea
          id={`${uid}-body`}
          name="body"
          rows={4}
          required
          maxLength={QUESTION_BODY_MAX}
          placeholder="Describe what you tried and what happened."
          aria-invalid={fieldError("body") ? true : undefined}
        />
        {fieldError("body") ? <FieldError message={fieldError("body")!} /> : null}
      </div>

      {state.status === "error" && !state.fieldErrors ? (
        <FieldError message={state.message} />
      ) : null}

      {state.status === "posted" ? (
        <p role="status" className="text-sm font-medium text-primary">
          Posted — your question is in the list below.
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Posting…" : "Post question"}
      </Button>
    </form>
  );
}
