"use client";

import { activeCueIndex, formatClock } from "@/lib/player";
import { cn } from "@/lib/utils";
import type { TranscriptCue } from "@/lib/vtt";
import { requestSeek, useVideoTime } from "./player-clock";

const LANGUAGE = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * The lecture's captions as a readable transcript. Each line is a button that
 * jumps the video there; the line under the playhead wears the highlighter
 * ("you are here") and aria-current="time". Nothing scrolls on its own, so a
 * reader keeps their place.
 */
export function TranscriptPanel({ cues, language }: { cues: TranscriptCue[]; language: string }) {
  const time = useVideoTime();
  const active = activeCueIndex(cues, time);
  const english = language === "en" || language.startsWith("en-");

  return (
    <div className="flex max-w-[68ch] flex-col gap-3">
      <h2 className="sr-only">Transcript</h2>
      <p className="text-sm text-graphite">
        Select a line to play the video from there.
        {english ? "" : ` In ${LANGUAGE.of(language) ?? language}.`}
      </p>
      <ol className="flex flex-col">
        {cues.map((cue, index) => {
          const current = index === active;
          return (
            <li key={`${cue.start}-${index}`}>
              <button
                type="button"
                onClick={() => requestSeek(Math.floor(cue.start))}
                aria-current={current ? "time" : undefined}
                className={cn(
                  "flex min-h-8 w-full cursor-pointer items-start gap-3 rounded-sm px-2 py-1.5 text-left focus-ring",
                  current ? "bg-mark" : "hover:bg-wash",
                )}
              >
                {/* Proportional figures: the tabular ones set ":" a whole figure wide. */}
                <span className={cn("w-14 shrink-0 pt-px text-sm", current ? "text-ink" : "text-graphite")}>
                  {formatClock(cue.start)}
                </span>
                <span className="text-base text-ink">{cue.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
