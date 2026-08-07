"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSignedPlayback, reportWatchProgress } from "./actions";

/**
 * HLS player. Safari plays HLS natively; everywhere else we load hls.js.
 * Progress is reported every ~15s and on pause/ended — never more often, so
 * a scrubbing learner doesn't hammer the server.
 */
export function VideoPlayer({
  itemId,
  slug,
  durationSeconds,
  startAt,
}: {
  itemId: string;
  slug: string;
  durationSeconds: number;
  startAt: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const watchedRef = useRef(0);
  const lastReportRef = useRef(0);

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

      const el = videoRef.current;
      if (!el) return;

      const canNative = el.canPlayType("application/vnd.apple.mpegurl") !== "";

      if (canNative) {
        el.src = signed.hlsUrl;
      } else {
        const Hls = (await import("hls.js")).default;
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setError("This browser cannot play HLS video.");
          setLoading(false);
          return;
        }
        const instance = new Hls({
          // Append CloudFront signature query params to child playlists/segments.
          xhrSetup(xhr, url) {
            // hls.js already uses the signed master URL; child requests need the
            // same query string when CloudFront is configured for signed URLs
            // with a wildcard custom policy on /hls/{assetId}/*.
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
      }

      if (startAt > 0) {
        el.currentTime = startAt;
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
    if (!el) return;
    const now = Date.now();
    if (!force && now - lastReportRef.current < 15_000) return;
    lastReportRef.current = now;

    watchedRef.current = Math.max(watchedRef.current, Math.floor(el.currentTime));
    await reportWatchProgress({
      itemId,
      slug,
      positionSeconds: Math.floor(el.currentTime),
      watchedSeconds: Math.max(watchedRef.current, Math.floor(el.currentTime)),
    });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-ink">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-white/80">
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </div>
      ) : null}
      {error ? (
        <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-white/80">
          {error}
        </div>
      ) : (
        <video
          ref={videoRef}
          className="aspect-video w-full"
          controls
          playsInline
          onPause={() => void report(true)}
          onTimeUpdate={() => void report(false)}
          onEnded={() => {
            watchedRef.current = Math.max(watchedRef.current, durationSeconds);
            void report(true);
          }}
        />
      )}
    </div>
  );
}
