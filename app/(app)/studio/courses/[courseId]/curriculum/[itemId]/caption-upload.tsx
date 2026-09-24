"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Captions</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="itemId" value={itemId} />
          {captions.length > 0 ? (
            <ul className="text-sm text-muted-foreground">
              {captions.map((caption) => (
                <li key={caption.id}>{caption.language}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No captions yet. Upload a WebVTT file.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">Language</Label>
              <Input id="language" name="language" defaultValue="en" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="file">VTT file</Label>
              <Input id="file" name="file" type="file" accept=".vtt,text/vtt" required />
            </div>
          </div>
          {state.status === "error" ? <FieldError message={state.message} /> : null}
          {state.status === "done" ? (
            <p role="status" className="text-sm font-medium">
              {state.message}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} variant="outline" className="w-fit">
            {pending ? "Uploading…" : "Attach captions"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
