"use client";

import { useSyncExternalStore } from "react";
import { VIEW_AS_LABEL_COOKIE } from "@/lib/view-as-cookie-name";

function readLabel(): string | null {
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${VIEW_AS_LABEL_COOKIE}=`));
  return entry ? entry.slice(VIEW_AS_LABEL_COOKIE.length + 1) : null;
}

const noSubscription = () => () => {};

/**
 * Shown on every page while an admin views the site as someone (read-only).
 * Reads a display-only cookie, so static pages stay static; the signed grant
 * cookie is what actually decides anything. Stop is a plain form POST.
 */
export function ViewAsBanner() {
  const raw = useSyncExternalStore(noSubscription, readLabel, () => null);
  if (!raw) return null;
  let label: { n?: unknown; e?: unknown };
  try {
    label = JSON.parse(decodeURIComponent(raw)) as { n?: unknown; e?: unknown };
  } catch {
    return null;
  }
  // No clock check here (render must stay pure): the cookie itself expires with the grant.
  if (typeof label.n !== "string" || typeof label.e !== "number") return null;
  const until = new Date(label.e).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div role="region" aria-label="Viewing as someone else" className="bg-ink text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <p>
          Viewing as <strong className="font-semibold">{label.n}</strong>: view only, until {until}. Changes are blocked.
        </p>
        <form method="post" action="/api/impersonation/stop">
          <button
            type="submit"
            className="inline-flex min-h-8 cursor-pointer items-center rounded-md border border-white/50 px-3 font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Stop viewing
          </button>
        </form>
      </div>
    </div>
  );
}
