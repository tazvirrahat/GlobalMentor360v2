"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSignedPlayback, reportWatchProgress } from "./actions";

/**
 * HLS player. Safari plays HLS natively; everywhere else we load hls.js.
 * Progress is reported every ~15s, on play, and on pause/ended — never more
 * often, so a scrubbing learner doesn't hammer the server.
 *
 * We report the playhead only. The server decides how much of it counts as
 * watched, so there is nothing here worth tampering with — the report on play
 * exists to give it a starting timestamp to meter the next report against.
 */
export function VideoPlayer({
  itemId,
  slug,
  startAt,
}: {
  itemId: string;
  slug: string;
  startAt: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastReportRef = useRef(0);
  // Guards reporting against a pending seek. Until the playhead is back where the
  // learner left off, its position is 0 and persisting that would destroy the
  // resume point they returned for.
  const seekedRef = useRef(false);

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

      // Seek only once the element knows its duration. Assigning currentTime at
      // readyState HAVE_NOTHING is silently dropped, which used to matter little
      // — the first progress report was 15s away. Now that play fires one
      // immediately (to open the metering window), a dropped seek would report
      // position 0 and overwrite the resume point the learner came back for.
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
    if (!el) return;
    if (!seekedRef.current) return;
    const now = Date.now();
    if (!force && now - lastReportRef.current < 15_000) return;
    lastReportRef.current = now;

    await reportWatchProgress({
      itemId,
      slug,
      positionSeconds: Math.floor(el.currentTime),
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
          onPlay={() => void report(true)}
          onPause={() => void report(true)}
          onTimeUpdate={() => void report(false)}
          onEnded={() => void report(true)}
        />
      )}
    </div>
  );
}
