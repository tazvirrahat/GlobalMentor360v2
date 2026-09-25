"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Headphones, Upload } from "lucide-react";
import { Panel } from "@/components/app/panel";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LECTURE_FILE_ACCEPT, LECTURE_FILE_MAX_BYTES, lectureFileKind, lectureFileLimitText } from "@/lib/lecture-files";
import { formatClock } from "@/lib/player";
import { finishLectureFileUpload, removeLectureFile, startLectureFileUpload } from "../../../../lecture-file-actions";
import { putWithProgress } from "../video-upload";

type Phase =
  | { name: "idle" }
  | { name: "uploading"; percent: number }
  | { name: "saving" }
  | { name: "done"; message: string }
  | { name: "error"; message: string };

export type LectureFileInfo = { kind: "AUDIO" | "FILE"; name: string; durationSeconds: number | null };

/** The browser reads an audio file's length before upload; 0 when it cannot. */
function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (seconds: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) ? seconds : 0);
    };
    const timer = window.setTimeout(() => done(0), 5000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(audio.duration);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      done(0);
    };
    audio.src = url;
  });
}

/**
 * The lecture editor's "Audio or PDF": instead of text or a video, the lesson
 * plays an audio file or shows a PDF. Uploading replaces a video; Remove turns
 * the lecture back into an article (its text is kept).
 */
export function LectureFilePanel({
  itemId,
  file,
  hasVideo,
  storageReady,
}: {
  itemId: string;
  file: LectureFileInfo | null;
  hasVideo: boolean;
  storageReady: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const busy = phase.name === "uploading" || phase.name === "saving";

  async function upload(chosen: File) {
    const kind = lectureFileKind(chosen.type);
    if (!kind) {
      setPhase({ name: "error", message: "Use an audio file (MP3, M4A, AAC, OGG, WAV) or a PDF." });
      return;
    }
    if (chosen.size > LECTURE_FILE_MAX_BYTES[kind]) {
      setPhase({ name: "error", message: lectureFileLimitText(kind) });
      return;
    }
    setPhase({ name: "uploading", percent: 0 });
    try {
      const durationSeconds = kind === "AUDIO" ? await readAudioDuration(chosen) : 0;
      const start = await startLectureFileUpload({ itemId, filename: chosen.name, contentType: chosen.type, sizeBytes: chosen.size });
      if (!start.ok) {
        setPhase({ name: "error", message: start.message });
        return;
      }
      await putWithProgress(start.uploadUrl, start.uploadHeaders, chosen, (percent) => setPhase({ name: "uploading", percent }));
      setPhase({ name: "saving" });
      const finished = await finishLectureFileUpload({ itemId, key: start.key, durationSeconds });
      if (!finished.ok) {
        setPhase({ name: "error", message: finished.message });
        return;
      }
      setPhase({ name: "done", message: kind === "AUDIO" ? "Audio saved." : "PDF saved." });
      router.refresh();
    } catch (error) {
      setPhase({ name: "error", message: error instanceof Error ? error.message : "The upload failed." });
    }
  }

  async function remove() {
    setPhase({ name: "saving" });
    const result = await removeLectureFile({ itemId });
    if (!result.ok) {
      setPhase({ name: "error", message: result.message });
      return;
    }
    setPhase({ name: "done", message: "Removed. The lecture shows its text again." });
    router.refresh();
    uploadButton.current?.focus();
  }

  return (
    <Panel title="Audio or PDF" description="Instead of text or a video, this lecture can play an audio file or show a PDF.">
      {file ? (
        <div className="flex items-center gap-3 border-y border-rule py-3">
          {file.kind === "AUDIO" ? (
            <Headphones className="size-5 shrink-0 text-graphite" aria-hidden />
          ) : (
            <FileText className="size-5 shrink-0 text-graphite" aria-hidden />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium break-all text-ink">{file.name}</span>
            <span className="text-sm text-graphite">
              {file.kind === "AUDIO" ? `Audio${file.durationSeconds ? `, ${formatClock(file.durationSeconds)}` : ""}` : "PDF"}
            </span>
          </span>
        </div>
      ) : null}

      {storageReady ? (
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept={LECTURE_FILE_ACCEPT}
            className="hidden"
            tabIndex={-1}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              event.target.value = "";
              if (chosen) void upload(chosen);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button ref={uploadButton} type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
              <Upload aria-hidden /> {file ? "Replace file" : "Upload audio or a PDF"}
            </Button>
            {file ? (
              <ConfirmSubmit
                label="Remove"
                question="Remove the file?"
                confirmLabel="Remove"
                size="default"
                variant="secondary"
                disabled={busy}
                onConfirm={() => void remove()}
              />
            ) : null}
            {phase.name === "uploading" ? (
              <span className="flex min-w-40 items-center gap-2">
                <Progress value={phase.percent} className="w-32" aria-label={`Upload progress ${phase.percent}%`} />
                <span className="text-sm text-graphite tabular-nums">{phase.percent}%</span>
              </span>
            ) : null}
            {phase.name === "saving" || phase.name === "done" ? (
              <span role="status" className="text-sm font-medium text-ink">
                {phase.name === "saving" ? "Saving…" : phase.message}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-graphite">
            MP3, M4A, AAC, OGG or WAV up to 200 MB, or a PDF up to 50 MB. Learners mark the lesson complete when they finish.
            {hasVideo ? " Uploading replaces the video." : ""}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-graphite">File uploads need cloud storage, which isn&apos;t set up on this site yet.</p>
          {/* Removing needs no storage: the lecture goes back to its text. */}
          {file ? (
            <div className="flex flex-wrap items-center gap-3">
              <ConfirmSubmit
                label="Remove"
                question="Remove the file?"
                confirmLabel="Remove"
                size="default"
                variant="secondary"
                disabled={busy}
                onConfirm={() => void remove()}
              />
              {phase.name === "saving" || phase.name === "done" ? (
                <span role="status" className="text-sm font-medium text-ink">
                  {phase.name === "saving" ? "Saving…" : phase.message}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {phase.name === "error" ? <FieldError message={phase.message} /> : null}
    </Panel>
  );
}
