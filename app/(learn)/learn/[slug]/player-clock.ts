"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny shared clock between the video and the notes, which sit in different
 * parts of the page: the video publishes its time, a note's chip asks it to
 * seek. Module state is per browser tab, which is exactly the scope needed.
 */
let time: number | null = null;
const timeListeners = new Set<() => void>();
const seekListeners = new Set<(seconds: number) => void>();

/** Called by the video (throttled); null when the video goes away. */
export function publishTime(seconds: number | null): void {
  const next = seconds === null ? null : Math.floor(seconds);
  if (next === time) return;
  time = next;
  for (const listener of timeListeners) listener();
}

function subscribe(listener: () => void) {
  timeListeners.add(listener);
  return () => {
    timeListeners.delete(listener);
  };
}

/** The video's current time in whole seconds, or null when there is no video. */
export function useVideoTime(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => time,
    () => null,
  );
}

export function requestSeek(seconds: number): void {
  for (const listener of seekListeners) listener(seconds);
}

export function onSeekRequest(handler: (seconds: number) => void): () => void {
  seekListeners.add(handler);
  return () => {
    seekListeners.delete(handler);
  };
}
