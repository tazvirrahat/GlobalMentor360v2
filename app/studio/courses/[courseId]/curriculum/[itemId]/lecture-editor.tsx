"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Lecture</CardTitle>
      </CardHeader>
      <CardContent>
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
            <p className="text-xs text-muted-foreground">
              A short summary of what this lecture covers.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="articleBody">Article body</Label>
            <Textarea
              id="articleBody"
              name="articleBody"
              defaultValue={lecture.articleBody ?? ""}
              rows={14}
              maxLength={50000}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {isVideo
                ? "This lecture plays a video, so the player does not show the article body. It is kept in case the video is removed."
                : "Plain text. Line breaks are preserved in the player; there is no markup."}
            </p>
          </div>

          {state.status !== "idle" ? (
            <p
              role="status"
              className={
                state.status === "error"
                  ? "text-sm font-medium text-destructive"
                  : "text-sm font-medium"
              }
            >
              {state.message}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-fit shadow-brand">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
