"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/site/field-error";
import { attachCaptionAction, type VideoActionState } from "../../../../video-actions";

const initial: VideoActionState = { status: "idle" };

export function CaptionUpload({
  itemId,
  captions,
}: {
  itemId: string;
  captions: { id: string; language: string }[];
}) {
  const [state, action, pending] = useActionState(attachCaptionAction, initial);

  return (
    <Panel title="Captions" description="Subtitle files learners can turn on in the video player.">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="itemId" value={itemId} />
        {captions.length > 0 ? (
          <p className="text-sm text-ink">
            Attached: {captions.map((caption) => caption.language).join(", ")}
          </p>
        ) : (
          <p className="text-sm text-graphite">No captions yet. Upload a WebVTT (.vtt) file.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caption-language">Language code</Label>
            <Input id="caption-language" name="language" defaultValue="en" required maxLength={10} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caption-file">Caption file (.vtt)</Label>
            <Input id="caption-file" name="file" type="file" accept=".vtt,text/vtt" required />
          </div>
        </div>
        {state.status === "error" ? <FieldError message={state.message} /> : null}
        {state.status === "done" ? (
          <p role="status" className="text-sm font-medium text-ink">
            {state.message}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} variant="secondary" className="w-fit">
          {pending ? "Uploading…" : "Attach captions"}
        </Button>
      </form>
    </Panel>
  );
}
