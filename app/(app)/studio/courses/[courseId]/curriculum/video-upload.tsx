"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  finalizeVideoUpload,
  refreshVideoStatus,
  startVideoUpload,
  type VideoActionState,
} from "../../../video-actions";
import { StatusBadge } from "@/components/course/status-badge";

const initial: VideoActionState = { status: "idle" };

export type LectureVideoInfo = {
  contentType: string;
  durationSeconds: number;
  asset: {
    id: string;
    status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
    failureReason: string | null;
  } | null;
};

type UploadPhase =
  | { name: "idle" }
  | { name: "uploading"; percent: number }
  | { name: "finalizing" }
  | { name: "error"; message: string };

/**
 * fetch() exposes no upload progress events, so the PUT goes through
 * XMLHttpRequest — the only browser API with `upload.onprogress`.
 */
function putWithProgress(
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
  const [phase, setPhase] = useState<UploadPhase>({ name: "idle" });

  if (!lecture) return null;

  const asset = lecture.asset;
  const busy = phase.name === "uploading" || phase.name === "finalizing";

  async function upload(file: File) {
    setPhase({ name: "uploading", percent: 0 });
    try {
      const start = await startVideoUpload({
        itemId,
        fileName: file.name,
        contentType: file.type || "video/mp4",
      });
      if (!start.ok) {
        setPhase({ name: "error", message: start.message });
        return;
      }

      await putWithProgress(start.uploadUrl, start.uploadHeaders, file, (percent) =>
        setPhase({ name: "uploading", percent }),
      );

      setPhase({ name: "finalizing" });
      const finalized = await finalizeVideoUpload({ itemId, mediaAssetId: start.mediaAssetId });
      if (!finalized.ok) {
        setPhase({ name: "error", message: finalized.message });
        return;
      }

      setPhase({ name: "idle" });
      router.refresh();
    } catch (error) {
      setPhase({
        name: "error",
        message: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="flex items-center gap-1.5 text-graphite">
        <Clapperboard className="size-4" aria-hidden />
        {lecture.contentType === "VIDEO" ? "Video" : "Article"}
      </span>
      {asset?.status === "READY" && lecture.durationSeconds > 0 ? (
        <span className="text-graphite">{formatDuration(lecture.durationSeconds)}</span>
      ) : null}

      {asset ? <StatusBadge kind="video" status={asset.status} /> : null}

      {phase.name === "uploading" ? (
        <span className="flex min-w-40 flex-1 items-center gap-2">
          <Progress value={phase.percent} className="max-w-48" aria-label={`Upload progress ${phase.percent}%`} />
          <span className="text-sm text-graphite tabular-nums">{phase.percent}%</span>
        </span>
      ) : phase.name === "finalizing" ? (
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
              if (file) void upload(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload aria-hidden />
            {asset ? "Replace video" : "Add video"}
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
      ) : null}

      {asset?.status === "FAILED" && asset.failureReason ? (
        <p role="alert" className="w-full text-sm text-seal">
          {asset.failureReason}
        </p>
      ) : null}
    </div>
  );
}
