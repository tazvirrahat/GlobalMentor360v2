"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Clapperboard, Loader2, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  finalizeVideoUpload,
  refreshVideoStatus,
  startVideoUpload,
  type VideoActionState,
} from "../../../video-actions";

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
      reject(new Error("Upload failed — network error (is the S3 bucket CORS rule set?)."));
    xhr.send(file);
  });
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function StatusBadge({ status }: { status: LectureVideoInfo["asset"] extends infer A ? (A extends { status: infer S } | null ? S : never) : never }) {
  switch (status) {
    case "READY":
      return (
        <Badge className="bg-brand text-white">
          <CircleCheck aria-hidden /> Ready
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="destructive">
          <TriangleAlert aria-hidden /> Failed
        </Badge>
      );
    case "PROCESSING":
      return (
        <Badge variant="secondary">
          <Loader2 className="animate-spin" aria-hidden /> Processing
        </Badge>
      );
    case "UPLOADING":
      return <Badge variant="outline">Uploading</Badge>;
  }
}

function CheckStatusForm({ itemId }: { itemId: string }) {
  const [state, action, pending] = useActionState(refreshVideoStatus, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
        {pending ? "Checking…" : "Check status"}
      </Button>
      {state.status !== "idle" ? (
        <span
          role="status"
          className={
            state.status === "error"
              ? "text-xs font-medium text-destructive"
              : "text-xs text-muted-foreground"
          }
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-0.5 text-sm">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clapperboard className="size-3.5" aria-hidden />
        {lecture.contentType === "VIDEO" ? "Video" : "Article"}
        {asset?.status === "READY" && lecture.durationSeconds > 0
          ? ` · ${formatDuration(lecture.durationSeconds)}`
          : null}
      </span>

      {asset ? <StatusBadge status={asset.status} /> : null}

      {phase.name === "uploading" ? (
        <span className="flex min-w-40 flex-1 items-center gap-2">
          <Progress value={phase.percent} className="max-w-48" />
          <span className="text-xs tabular-nums text-muted-foreground">{phase.percent}%</span>
        </span>
      ) : phase.name === "finalizing" ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Starting transcode…
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
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload aria-hidden />
            {asset ? "Replace video" : "Add video"}
          </Button>
          {asset && (asset.status === "UPLOADING" || asset.status === "PROCESSING") ? (
            <CheckStatusForm itemId={itemId} />
          ) : null}
        </>
      )}

      {phase.name === "error" ? (
        <p role="alert" className="w-full text-xs font-medium text-destructive">
          {phase.message}
        </p>
      ) : null}

      {asset?.status === "FAILED" && asset.failureReason ? (
        <p role="alert" className="w-full text-xs text-destructive/90">
          {asset.failureReason}
        </p>
      ) : null}
    </div>
  );
}
