"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { refreshVideoStatus, type VideoActionState } from "../../../video-actions";
import { useVideoUpload } from "./use-video-upload";
import { StatusBadge } from "@/components/course/status-badge";

const initial: VideoActionState = { status: "idle" };

const CONTENT_LABELS: Record<string, string> = { VIDEO: "Video", AUDIO: "Audio", FILE: "PDF", ARTICLE: "Article" };

export type LectureVideoInfo = {
  contentType: string;
  durationSeconds: number;
  asset: {
    id: string;
    status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
    failureReason: string | null;
  } | null;
};

/**
 * fetch() exposes no upload progress events, so the PUT goes through
 * XMLHttpRequest — the only browser API with `upload.onprogress`.
 */
export function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "The upload stopped because of a network error. Try again; if it keeps failing, ask the site admin to check the video storage settings.",
        ),
      );
    xhr.send(file);
  });
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}


function CheckStatusForm({ itemId }: { itemId: string }) {
  const [state, action, pending] = useActionState(refreshVideoStatus, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <RefreshCw className={pending ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
        {pending ? "Checking…" : "Check status"}
      </Button>
      {state.status !== "idle" ? (
        <span
          role="status"
          className={state.status === "error" ? "text-sm font-medium text-seal" : "text-sm text-graphite"}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function LectureVideoPanel({
  itemId,
  lecture,
}: {
  itemId: string;
  lecture: LectureVideoInfo | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useVideoUpload({ kind: "lecture", itemId }, () => router.refresh());
  const phase = upload.phase;

  if (!lecture) return null;

  // Audio and PDF lessons keep their file on the lecture editor page; here they
  // only say what they are, and "Use a video instead" replaces the file.
  const fileLesson = lecture.contentType === "AUDIO" || lecture.contentType === "FILE";
  const asset = fileLesson ? null : lecture.asset;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="flex items-center gap-1.5 text-graphite">
        <Clapperboard className="size-4" aria-hidden />
        {CONTENT_LABELS[lecture.contentType] ?? "Article"}
      </span>
      {(asset?.status === "READY" || lecture.contentType === "AUDIO") && lecture.durationSeconds > 0 ? (
        <span className="text-graphite">{formatDuration(lecture.durationSeconds)}</span>
      ) : null}

      {asset ? <StatusBadge kind="video" status={asset.status} /> : null}

      {phase.name === "uploading" ? (
        <span className="flex min-w-40 flex-1 flex-wrap items-center gap-2">
          <Progress value={phase.percent} className="max-w-48" aria-label={`Upload progress ${phase.percent}%`} />
          <span className="text-sm text-graphite tabular-nums">
            {phase.resuming ? `Resuming, ${phase.percent}%` : `${phase.percent}%`}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={upload.cancel}>
            Cancel upload
          </Button>
        </span>
      ) : phase.name === "finishing" ? (
        <span role="status" className="flex items-center gap-1.5 text-graphite">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Preparing the video…
        </span>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Allow re-selecting the same file after a failure.
              event.target.value = "";
              if (file) void upload.start(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={upload.busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload aria-hidden />
            {fileLesson ? "Use a video instead" : asset ? "Replace video" : "Add video"}
          </Button>
          {asset &&
          (asset.status === "UPLOADING" ||
            asset.status === "PROCESSING" ||
            asset.status === "FAILED") ? (
            <CheckStatusForm itemId={itemId} />
          ) : null}
        </>
      )}

      {phase.name === "error" ? (
        <p role="alert" className="w-full text-sm font-medium text-seal">
          {phase.message}
        </p>
      ) : phase.name === "cancelled" ? (
        <p role="status" className="w-full text-sm text-graphite">
          Upload cancelled.
        </p>
      ) : null}

      {asset?.status === "FAILED" && asset.failureReason ? (
        <p role="alert" className="w-full text-sm text-seal">
          {asset.failureReason}
        </p>
      ) : null}
    </div>
  );
}
