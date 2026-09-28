"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Upload } from "lucide-react";
import { StatusBadge } from "@/components/course/status-badge";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { refreshPromoStatus, removePromoVideo } from "../../video-actions";
import { useVideoUpload } from "./curriculum/use-video-upload";

type Promo = { id: string; status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED"; failureReason: string | null } | null;

/**
 * The Landing page tab's "Promo video": a short video on the course page that
 * anyone can watch. It sits inside the editor's form, so its controls are
 * plain buttons that save on their own (like the course image).
 */
export function PromoVideoField({ courseId, promo, storageReady }: { courseId: string; promo: Promo; storageReady: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const upload = useVideoUpload({ kind: "promo", courseId }, () => router.refresh());
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const phase = upload.phase;

  async function check() {
    setMessage(null);
    const result = await refreshPromoStatus({ courseId });
    setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
    router.refresh();
  }

  async function remove() {
    setMessage(null);
    const result = await removePromoVideo({ courseId });
    setMessage(result.ok ? { tone: "ok", text: "Promo video removed." } : { tone: "error", text: result.message });
    router.refresh();
    uploadButton.current?.focus();
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby="promo-hint">
      <legend className="text-base font-semibold text-ink">Promo video</legend>
      <p id="promo-hint" className="text-sm text-graphite">
        {storageReady
          ? "A short video on the course page, open to everyone. One to two minutes on what learners will get works best."
          : "Video uploads need cloud storage, which isn't set up on this site yet."}
      </p>

      {promo ? (
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge kind="video" status={promo.status} />
          <span className="text-sm text-graphite">
            {promo.status === "READY"
              ? "Showing on the course page."
              : promo.status === "FAILED"
                ? "Processing failed. Upload it again."
                : "Being prepared. It shows on the course page when it's ready."}
          </span>
        </div>
      ) : null}
      {promo?.status === "FAILED" && promo.failureReason ? <p className="text-sm text-seal">{promo.failureReason}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        {storageReady ? (
          <>
            <input
              ref={input}
              type="file"
              accept="video/*"
              className="hidden"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload.start(file);
              }}
            />
            <Button ref={uploadButton} type="button" variant="secondary" disabled={upload.busy} onClick={() => input.current?.click()}>
              <Upload aria-hidden /> {promo ? "Replace promo" : "Upload a promo"}
            </Button>
          </>
        ) : null}
        {promo && (promo.status === "UPLOADING" || promo.status === "PROCESSING") ? (
          <Button type="button" variant="ghost" disabled={upload.busy} onClick={() => void check()}>
            <RefreshCw aria-hidden /> Check status
          </Button>
        ) : null}
        {promo ? (
          <ConfirmSubmit
            label="Remove promo"
            question="Remove the promo video?"
            confirmLabel="Remove"
            size="default"
            variant="secondary"
            disabled={upload.busy}
            onConfirm={() => void remove()}
          />
        ) : null}
      </div>

      {phase.name === "uploading" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Progress value={phase.percent} className="w-48" aria-label={`Upload progress ${phase.percent}%`} />
          <span className="text-sm text-graphite tabular-nums">{phase.resuming ? `Resuming, ${phase.percent}%` : `${phase.percent}%`}</span>
          <Button type="button" variant="ghost" size="sm" onClick={upload.cancel}>
            Cancel upload
          </Button>
        </div>
      ) : phase.name === "finishing" ? (
        <p role="status" className="text-sm text-graphite">
          Preparing the video…
        </p>
      ) : phase.name === "cancelled" ? (
        <p role="status" className="text-sm text-graphite">
          Upload cancelled.
        </p>
      ) : null}
      {phase.name === "error" ? <FieldError message={phase.message} /> : null}
      {message?.tone === "error" ? <FieldError message={message.text} /> : null}
      {message?.tone === "ok" ? (
        <p role="status" className="text-sm font-medium text-ink">
          {message.text}
        </p>
      ) : null}
    </fieldset>
  );
}
