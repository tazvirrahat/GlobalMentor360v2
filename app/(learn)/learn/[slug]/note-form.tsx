"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatClock } from "@/lib/player";
import { saveNoteAction, type NoteFormState } from "./note-actions";
import { requestSeek, useVideoTime } from "./player-clock";

const initial: NoteFormState = { status: "idle" };

/**
 * Take a note. On a video lesson the "At" field fills in with the video's time
 * when you start writing, so the note can jump back to that moment later.
 */
export function NoteForm({ lectureId, itemId, slug }: { lectureId: string; itemId: string; slug: string }) {
  const [state, action, pending] = useActionState(saveNoteAction, initial);
  const videoTime = useVideoTime();
  const atRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const touchedAt = useRef(false);

  useEffect(() => {
    if (state.status === "saved") {
      formRef.current?.reset();
      touchedAt.current = false;
    }
  }, [state]);

  const hasVideo = videoTime !== null;
  const bodyError = state.status === "error" && state.field !== "at" ? state.message : null;
  const atError = state.status === "error" && state.field === "at" ? state.message : null;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lectureId" value={lectureId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note-body">Note</Label>
        <Textarea
          id="note-body"
          name="body"
          rows={3}
          placeholder="Capture something from this lecture…"
          required
          maxLength={4000}
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={bodyError ? "note-body-error" : undefined}
          onFocus={() => {
            // Stamp the note with where the video is, unless you typed a time.
            if (hasVideo && !touchedAt.current && atRef.current) atRef.current.value = formatClock(videoTime);
          }}
        />
        {bodyError ? (
          <p id="note-body-error" role="alert" className="text-sm font-medium text-seal">
            {bodyError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {hasVideo ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note-at">At (m:ss)</Label>
            <Input
              ref={atRef}
              id="note-at"
              name="at"
              inputMode="numeric"
              autoComplete="off"
              defaultValue="0:00"
              onChange={() => {
                touchedAt.current = true;
              }}
              className="w-28"
              aria-invalid={atError ? true : undefined}
              aria-describedby={atError ? "note-at-error" : undefined}
            />
          </div>
        ) : (
          <input type="hidden" name="at" value="0" />
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </Button>
        <span role="status" className="text-sm text-graphite">
          {state.status === "saved" ? "Note saved." : ""}
        </span>
      </div>
      {atError ? (
        <p id="note-at-error" role="alert" className="text-sm font-medium text-seal">
          {atError}
        </p>
      ) : null}
    </form>
  );
}

/** "Play from 1:15": seeks the video; plain text when the lesson has no video. */
export function NoteTime({ seconds }: { seconds: number }) {
  const videoTime = useVideoTime();
  if (videoTime === null) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-8 px-2 text-xs"
      onClick={() => requestSeek(seconds)}
      aria-label={`Play from ${formatClock(seconds)}`}
    >
      {formatClock(seconds)}
    </Button>
  );
}
