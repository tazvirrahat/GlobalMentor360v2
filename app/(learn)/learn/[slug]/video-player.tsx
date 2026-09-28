"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type Hls from "hls.js";
import { Loader2 } from "lucide-react";
import { qualityOptions, type QualityOption } from "@/lib/player";
import type { Playback } from "@/lib/playback";
import { reportWatchProgress } from "./actions";
import { onSeekRequest, publishTime } from "./player-clock";

const SPEED_KEY = "gm360.playbackSpeed";
const QUALITY_KEY = "gm360.quality";
const AUTOPLAY_KEY = "gm360.autoplayNext";
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
/** Seconds between a finished lesson and the next one opening, with Cancel. */
const ADVANCE_SECONDS = 5;

// Browser-local conveniences; a blocked or empty storage falls back to defaults.
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

function readStoredSpeed(): number {
  const stored = Number(readStorage(SPEED_KEY));
  return SPEEDS.includes(stored) ? stored : 1;
}

function readStoredAutoplay(): boolean {
  return readStorage(AUTOPLAY_KEY) !== "false";
}

const CONTROL =
  "h-9 cursor-pointer rounded-md border border-white/20 bg-white/10 px-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

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
 * Speed, quality (a height, applied once hls.js has read the levels) and
 * auto-advance are remembered in localStorage per browser. Captions, when the
 * lecture has a VTT attached, render as native <track> elements.
 *
 * When the video finishes the lecture, auto-advance counts down five seconds
 * with a Cancel button before opening the next lesson (WCAG 2.2.1); with it
 * off, the page refreshes so the "Next lesson" button appears.
 */
export function VideoPlayer(
  props: { itemId: string; slug: string; startAt: number; nextHref?: string | null } | { promoCourseId: string },
) {
  // A course's promo plays in the same player, but reports no progress, has no
  // notes clock and no next lesson.
  const promoCourseId = "promoCourseId" in props ? props.promoCourseId : null;
  const itemId = "itemId" in props ? props.itemId : null;
  const slug = "slug" in props ? props.slug : "";
  const startAt = "startAt" in props ? props.startAt : 0;
  const nextHref = "nextHref" in props ? (props.nextHref ?? null) : null;
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
  const storedAutoplay = useSyncExternalStore(subscribeToStorage, readStoredAutoplay, () => true);
  const [chosenAutoplay, setChosenAutoplay] = useState<boolean | null>(null);
  const autoplay = chosenAutoplay ?? storedAutoplay;
  const [levels, setLevels] = useState<QualityOption[]>([]);
  const [quality, setQuality] = useState(-1);
  const [countdown, setCountdown] = useState<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastReportRef = useRef(0);
  const seekedRef = useRef(false);

  // The countdown after a finished lesson; Cancel sets it back to null.
  useEffect(() => {
    if (countdown === null || !nextHref) return;
    if (countdown <= 0) {
      router.push(nextHref as Route);
      router.refresh();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, nextHref, router]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.playbackRate = speed;
  }, [speed]);

  // Notes read the current time and ask the video to seek (player-clock.ts).
  useEffect(() => {
    if (promoCourseId) return;
    publishTime(0);
    const stop = onSeekRequest((seconds) => {
      const el = videoRef.current;
      if (!el) return;
      el.currentTime = seconds;
      el.focus();
      void el.play().catch(() => undefined);
    });
    return () => {
      stop();
      publishTime(null);
    };
  }, [promoCourseId]);

  useEffect(() => {
    let cancelled = false;
    let hls: Hls | null = null;

    async function setup() {
      setLoading(true);
      setError(null);

      // GET, not a server action: it must keep working in the read-only "view as" mode.
      const source = promoCourseId
        ? `/api/playback/promo/${encodeURIComponent(promoCourseId)}`
        : `/api/playback/lecture/${encodeURIComponent(itemId ?? "")}`;
      let signed: Playback;
      try {
        signed = (await (await fetch(source, { cache: "no-store" })).json()) as Playback;
      } catch {
        signed = { ok: false, message: "Video is unavailable right now. Please try again shortly." };
      }
      if (cancelled) return;

      if (!signed.ok) {
        setError(signed.message);
        setLoading(false);
        return;
      }

      setCaptions(signed.captions);

      const el = videoRef.current;
      if (!el) return;

      const HlsClass = (await import("hls.js")).default;
      if (cancelled) return;
      if (!HlsClass.isSupported()) {
        setError(
          "This browser is not supported for protected playback. Use the latest Chrome, Firefox, Edge, or Safari 17.1+.",
        );
        setLoading(false);
        return;
      }
      const instance = new HlsClass({
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
      instance.on(HlsClass.Events.MANIFEST_PARSED, () => {
        const options = qualityOptions(instance.levels);
        setLevels(options);
        // Apply the remembered height when this video has it; otherwise stay adaptive.
        const height = Number(readStorage(QUALITY_KEY));
        const match = instance.levels.findIndex((level) => level.height === height);
        if (height > 0 && match >= 0) {
          instance.currentLevel = match;
          setQuality(match);
        }
      });
      instance.loadSource(signed.hlsUrl);
      instance.attachMedia(el);
      hls = instance;
      hlsRef.current = instance;

      el.playbackRate = readStoredSpeed();

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
      hlsRef.current = null;
    };
  }, [itemId, promoCourseId, startAt]);

  async function report(force = false) {
    const el = videoRef.current;
    if (!el || !itemId) return null;
    if (!seekedRef.current) return null;
    const now = Date.now();
    if (!force && now - lastReportRef.current < 15_000) return null;
    lastReportRef.current = now;

    // Refused while an admin is viewing as someone (read-only); that is fine.
    return reportWatchProgress({
      itemId,
      slug,
      positionSeconds: Math.floor(el.currentTime),
    }).catch(() => null);
  }

  async function onEnded() {
    const result = await report(true);
    // nextHref is the item sequential unlock will open after *this* lecture
    // completes. Seeking to the end does not complete it, so do not walk into
    // a still-locked lesson.
    if (!result?.ok || !result.completed) return;
    if (nextHref && autoplay) setCountdown(ADVANCE_SECONDS);
    else router.refresh();
  }

  function cancelAdvance() {
    setCountdown(null);
    // Show the finished state and the "Next lesson" button instead.
    router.refresh();
  }

  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg bg-ink">
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
            onTimeUpdate={(event) => {
              if (!promoCourseId) publishTime(event.currentTarget.currentTime);
              void report(false);
            }}
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
          <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/15 px-4 py-2 text-sm text-white">
            <label className="flex cursor-pointer items-center gap-2">
              Speed
              <select
                className={CONTROL}
                value={speed}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setChosenSpeed(next);
                  writeStorage(SPEED_KEY, String(next));
                }}
              >
                {SPEEDS.map((value) => (
                  <option key={value} value={value} className="text-foreground">
                    {value}×
                  </option>
                ))}
              </select>
            </label>
            {levels.length > 2 ? (
              <label className="flex cursor-pointer items-center gap-2">
                Quality
                <select
                  className={CONTROL}
                  value={quality}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setQuality(next);
                    if (hlsRef.current) hlsRef.current.currentLevel = next;
                    const height = next >= 0 ? (hlsRef.current?.levels[next]?.height ?? 0) : 0;
                    writeStorage(QUALITY_KEY, String(height));
                  }}
                >
                  {levels.map((option) => (
                    <option key={option.value} value={option.value} className="text-foreground">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {nextHref ? (
              <label className="flex min-h-9 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="size-6 shrink-0 cursor-pointer accent-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  checked={autoplay}
                  onChange={(event) => {
                    setChosenAutoplay(event.target.checked);
                    writeStorage(AUTOPLAY_KEY, String(event.target.checked));
                    if (!event.target.checked && countdown !== null) cancelAdvance();
                  }}
                />
                Autoplay next lesson
              </label>
            ) : null}
            {countdown !== null && nextHref ? (
              <span className="ml-auto flex items-center gap-3">
                <span role="status">Next lesson in {countdown} s</span>
                <button
                  type="button"
                  onClick={cancelAdvance}
                  className="inline-flex h-9 items-center rounded-md border border-white/40 px-3 font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Cancel
                </button>
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
