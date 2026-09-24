"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Loader2 } from "lucide-react";
import { getSignedPlayback, reportWatchProgress } from "./actions";

const SPEED_KEY = "gm360.playbackSpeed";
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function readStoredSpeed(): number {
  const stored = Number(window.localStorage.getItem(SPEED_KEY));
  return SPEEDS.includes(stored) ? stored : 1;
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * HLS player for CloudFront signed URLs.
 *
 * Prefer hls.js whenever Hls.isSupported() (1.6.x uses ManagedMediaSource on
 * Safari 17.1+ / iOS 17.1+). Native HLS (el.src = signed master URL) cannot
 * copy the CloudFront policy onto child playlists and segments, so those
 * requests 403. xhrSetup on hls.js copies the query string.
 *
 * Old iOS without ManagedMediaSource cannot play protected HLS this way;
 * CloudFront signed cookies on a custom domain are the long-term fix and are
 * out of scope here. Show a clear unsupported message instead of a broken
 * native player.
 *
 * Progress is reported every ~15s, on play, and on pause/ended — never more
 * often, so a scrubbing learner doesn't hammer the server.
 *
 * Playback speed is remembered in localStorage per browser. Captions, when the
 * lecture has a VTT attached, render as native <track> elements.
 */
export function VideoPlayer({
  itemId,
  slug,
  startAt,
  nextHref,
}: {
  itemId: string;
  slug: string;
  startAt: number;
  nextHref?: string | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [captions, setCaptions] = useState<{ id: string; language: string; src: string }[]>([]);
  // The remembered speed is external state (localStorage), so it is read with
  // useSyncExternalStore; the server snapshot is 1x, which is what SSR renders.
  const storedSpeed = useSyncExternalStore(subscribeToStorage, readStoredSpeed, () => 1);
  const [chosenSpeed, setChosenSpeed] = useState<number | null>(null);
  const speed = chosenSpeed ?? storedSpeed;
  const [advancing, setAdvancing] = useState(false);
  const lastReportRef = useRef(0);
  const seekedRef = useRef(false);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;

    async function setup() {
      setLoading(true);
      setError(null);

      const signed = await getSignedPlayback(itemId);
      if (cancelled) return;

      if (!signed.ok) {
        setError(signed.message);
        setLoading(false);
        return;
      }

      setCaptions(signed.captions);

      const el = videoRef.current;
      if (!el) return;

      const Hls = (await import("hls.js")).default;
      if (cancelled) return;
      if (!Hls.isSupported()) {
        setError(
          "This browser is not supported for protected playback. Use the latest Chrome, Firefox, Edge, or Safari 17.1+.",
        );
        setLoading(false);
        return;
      }
      const instance = new Hls({
        xhrSetup(xhr, url) {
          try {
            const master = new URL(signed.hlsUrl);
            const target = new URL(url, signed.hlsUrl);
            if (target.origin === master.origin) {
              master.searchParams.forEach((value, key) => {
                if (!target.searchParams.has(key)) target.searchParams.set(key, value);
              });
              xhr.open("GET", target.toString(), true);
            }
          } catch {
            // Fall through to the default open.
          }
        },
      });
      instance.loadSource(signed.hlsUrl);
      instance.attachMedia(el);
      hls = instance;

      el.playbackRate = Number(window.localStorage.getItem(SPEED_KEY)) || 1;

      if (startAt > 0) {
        if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
          el.currentTime = startAt;
        } else {
          el.addEventListener(
            "loadedmetadata",
            () => {
              el.currentTime = startAt;
              seekedRef.current = true;
            },
            { once: true },
          );
        }
      }
      if (startAt === 0 || el.readyState >= HTMLMediaElement.HAVE_METADATA) {
        seekedRef.current = true;
      }

      setLoading(false);
    }

    void setup();

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [itemId, startAt]);

  async function report(force = false) {
    const el = videoRef.current;
    if (!el) return null;
    if (!seekedRef.current) return null;
    const now = Date.now();
    if (!force && now - lastReportRef.current < 15_000) return null;
    lastReportRef.current = now;

    return reportWatchProgress({
      itemId,
      slug,
      positionSeconds: Math.floor(el.currentTime),
    });
  }

  async function onEnded() {
    const result = await report(true);
    if (!nextHref) return;
    // nextHref is the item sequential unlock will open after *this* lecture
    // completes. Seeking to the end does not complete it, so do not walk into
    // a still-locked lesson.
    if (!result?.ok || !result.completed) return;
    setAdvancing(true);
    window.setTimeout(() => {
      router.push(nextHref as Route);
      router.refresh();
    }, 1500);
  }

  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg bg-brand-ink">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-white/80">
          <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="sr-only">Loading video</span>
        </div>
      ) : null}
      {error ? (
        <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-white/80">
          {error}
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className="aspect-video w-full"
            controls
            playsInline
            onPlay={() => void report(true)}
            onPause={() => void report(true)}
            onTimeUpdate={() => void report(false)}
            onEnded={onEnded}
          >
            {captions.map((caption) => (
              <track
                key={caption.id}
                kind="subtitles"
                src={caption.src}
                srcLang={caption.language}
                label={caption.language}
                default={caption.language === "en"}
              />
            ))}
          </video>
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-2 text-sm text-white/85">
            <label className="flex cursor-pointer items-center gap-2">
              Speed
              <select
                className="h-9 cursor-pointer rounded-md border border-white/20 bg-white/10 px-2 text-white focus-visible:ring-[3px] focus-visible:ring-white/40 focus-visible:outline-none"
                value={speed}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setChosenSpeed(next);
                  window.localStorage.setItem(SPEED_KEY, String(next));
                }}
              >
                {SPEEDS.map((value) => (
                  <option key={value} value={value} className="text-foreground">
                    {value}×
                  </option>
                ))}
              </select>
            </label>
            {advancing && nextHref ? <span>Playing next lesson…</span> : null}
          </div>
        </>
      )}
    </div>
  );
}
