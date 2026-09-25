"use client";

import { useRef, useState } from "react";
import type { VideoUploadTarget } from "../../../video-actions";
import { uploadVideoResumable } from "./resumable-upload";

export type VideoUploadPhase =
  | { name: "idle" }
  | { name: "uploading"; percent: number; resuming: boolean }
  | { name: "finishing" }
  | { name: "cancelled" }
  | { name: "error"; message: string };

/** The state of one resumable video upload, for a lecture row or the promo field. */
export function useVideoUpload(target: VideoUploadTarget, onDone: () => void) {
  const [phase, setPhase] = useState<VideoUploadPhase>({ name: "idle" });
  const controller = useRef<AbortController | null>(null);

  async function start(file: File) {
    if (!file.type.startsWith("video/")) {
      setPhase({ name: "error", message: "Pick a video file to upload." });
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    let resuming = false;
    setPhase({ name: "uploading", percent: 0, resuming });
    try {
      const outcome = await uploadVideoResumable(file, target, {
        signal: abort.signal,
        onPhase: (next) => {
          if (next === "resuming") resuming = true;
          if (next === "finishing") setPhase({ name: "finishing" });
        },
        onProgress: (percent) => setPhase((current) => (current.name === "finishing" ? current : { name: "uploading", percent, resuming })),
      });
      if (outcome.ok) {
        setPhase({ name: "idle" });
        onDone();
      } else {
        setPhase(outcome.cancelled ? { name: "cancelled" } : { name: "error", message: outcome.message });
      }
    } catch (error) {
      setPhase({ name: "error", message: error instanceof Error ? error.message : "The upload failed." });
    } finally {
      controller.current = null;
    }
  }

  return {
    phase,
    busy: phase.name === "uploading" || phase.name === "finishing",
    start,
    cancel: () => controller.current?.abort(),
  };
}
