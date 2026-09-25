"use client";

import { PlayCircle } from "lucide-react";
import { VideoPlayer } from "@/app/(learn)/learn/[slug]/video-player";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * "Watch the promo" in the buy box. The player mounts only while the dialog
 * is open (Radix unmounts closed content), so closing it stops the video.
 */
export function PromoDialog({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 self-center rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
        >
          <PlayCircle className="size-4" aria-hidden /> Watch the promo
        </button>
      </DialogTrigger>
      <DialogContent className="gap-3 p-4 sm:max-w-3xl sm:p-5">
        <DialogHeader className="pr-8">
          <DialogTitle>Promo: {courseTitle}</DialogTitle>
          <DialogDescription className="sr-only">A short video about the course.</DialogDescription>
        </DialogHeader>
        <VideoPlayer promoCourseId={courseId} />
      </DialogContent>
    </Dialog>
  );
}
