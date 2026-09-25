"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { CoverMark } from "@/components/course/cover-mark";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { COURSE_IMAGE_MAX_BYTES, COURSE_IMAGE_TYPES, isCourseImageType } from "@/lib/course-image";
import { finishCourseImageUpload, removeCourseImage, startCourseImageUpload } from "../../course-image-actions";
import { putWithProgress } from "./curriculum/video-upload";

type Phase =
  | { name: "idle" }
  | { name: "uploading"; percent: number }
  | { name: "saving" }
  | { name: "done"; message: string }
  | { name: "error"; message: string };

const ACCEPT = Object.keys(COURSE_IMAGE_TYPES).join(",");

/**
 * The Details tab's "Course image". It sits inside the editor's form, so every
 * control is a plain button that calls its action directly: nothing here
 * submits the form, and the image saves on its own, not with Save.
 */
export function CourseImageField({
  courseId,
  title,
  slug,
  imageUrl,
  storageReady,
}: {
  courseId: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  storageReady: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const busy = phase.name === "uploading" || phase.name === "saving";

  async function upload(file: File) {
    if (!isCourseImageType(file.type)) {
      setPhase({ name: "error", message: "Use a JPEG, PNG or WebP image." });
      return;
    }
    if (file.size > COURSE_IMAGE_MAX_BYTES) {
      setPhase({ name: "error", message: "Images can be up to 5 MB." });
      return;
    }
    setPhase({ name: "uploading", percent: 0 });
    try {
      const start = await startCourseImageUpload({ courseId, contentType: file.type, sizeBytes: file.size });
      if (!start.ok) {
        setPhase({ name: "error", message: start.message });
        return;
      }
      await putWithProgress(start.uploadUrl, start.uploadHeaders, file, (percent) =>
        setPhase({ name: "uploading", percent }),
      );
      setPhase({ name: "saving" });
      const finished = await finishCourseImageUpload({ courseId, key: start.key });
      if (!finished.ok) {
        setPhase({ name: "error", message: finished.message });
        return;
      }
      setPhase({ name: "done", message: "Image saved." });
      router.refresh();
    } catch (error) {
      setPhase({ name: "error", message: error instanceof Error ? error.message : "The upload failed." });
    }
  }

  async function remove() {
    setPhase({ name: "saving" });
    const result = await removeCourseImage({ courseId });
    if (!result.ok) {
      setPhase({ name: "error", message: result.message });
      return;
    }
    setPhase({ name: "done", message: "Image removed." });
    router.refresh();
    uploadButton.current?.focus();
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby="course-image-hint">
      <legend className="text-base font-semibold text-ink">Course image</legend>
      <div className="flex flex-wrap items-start gap-4">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt="The current course image"
            width={320}
            height={180}
            unoptimized
            className="aspect-video w-48 rounded-md border border-rule bg-wash object-cover"
          />
        ) : (
          <CoverMark title={title} slug={slug} size={64} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p id="course-image-hint" className="text-sm text-graphite">
            {storageReady
              ? "Shown on the course page and beside the course in lists. JPEG, PNG or WebP, up to 5 MB; 1280 × 720 works well. Lists show the middle as a square."
              : "Image uploads need cloud storage, which isn't set up on this site yet. Until then the course shows its letter tile."}
          </p>
          {storageReady ? (
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={input}
                type="file"
                accept={ACCEPT}
                className="hidden"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void upload(file);
                }}
              />
              <Button
                ref={uploadButton}
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <Upload aria-hidden /> {imageUrl ? "Replace image" : "Upload image"}
              </Button>
              {imageUrl ? (
                <ConfirmSubmit
                  label="Remove image"
                  question="Remove the image?"
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
          ) : null}
          {phase.name === "error" ? <FieldError message={phase.message} /> : null}
        </div>
      </div>
    </fieldset>
  );
}
