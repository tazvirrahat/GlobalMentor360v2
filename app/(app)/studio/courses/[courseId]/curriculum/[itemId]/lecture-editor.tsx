"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/site/field-error";
import { updateLecture, type CurriculumState } from "../../../../curriculum-actions";

const initial: CurriculumState = { status: "idle" };

export type EditableLecture = {
  id: string;
  contentType: string;
  description: string | null;
  articleBody: string | null;
};

export function LectureEditor({
  itemId,
  title,
  lecture,
}: {
  itemId: string;
  title: string;
  lecture: EditableLecture;
}) {
  const [state, action, pending] = useActionState(updateLecture, initial);
  const isVideo = lecture.contentType === "VIDEO";

  return (
    <Panel title="Lecture">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="itemId" value={itemId} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={title} required maxLength={200} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={lecture.description ?? ""}
            rows={3}
            maxLength={2000}
          />
          <p className="text-sm text-graphite">A short summary, shown under the lesson in the player.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="articleBody">Article body</Label>
          <Textarea
            id="articleBody"
            name="articleBody"
            defaultValue={lecture.articleBody ?? ""}
            rows={16}
            maxLength={50000}
            aria-describedby="article-hint"
          />
          <p id="article-hint" className="text-sm text-graphite">
            {isVideo
              ? "This lecture plays a video, so learners don't see this text. It is kept in case the video is removed."
              : "Leave a blank line between paragraphs. Put code in backticks, like `npm install`, to show it in a code font."}
          </p>
        </div>

        {state.status === "error" ? <FieldError message={state.message} /> : null}
        {state.status === "done" ? (
          <p role="status" className="text-sm font-medium text-ink">
            {state.message}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Panel>
  );
}
