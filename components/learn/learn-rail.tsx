"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "gm360:rail-collapsed";
const CHANGE = "gm360:rail-change";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

function write(collapsed: boolean) {
  try {
    window.localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(CHANGE));
}

/**
 * Desktop curriculum rail (lg and up): 300px, sticky under the top bar, scrolls
 * on its own. It collapses to a thin strip; the choice is remembered on this
 * device. Below lg the same list lives in the "Contents" sheet instead.
 */
export function LearnRail({ children }: { children: ReactNode }) {
  // Server snapshot is "expanded": that is what SSR renders.
  const collapsed = useSyncExternalStore(subscribe, read, () => false);

  return (
    <aside
      aria-label="Course contents"
      className={cn(
        "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r border-rule bg-surface lg:flex",
        collapsed ? "w-14" : "w-[300px]",
      )}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => write(false)}
          aria-expanded="false"
          aria-label="Show course contents"
          className="m-1.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-ink hover:bg-wash focus-ring"
        >
          <PanelLeftOpen className="size-5" strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
        <>
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-rule pr-1.5 pl-4">
            <span className="text-sm font-semibold text-ink">Course contents</span>
            <button
              type="button"
              onClick={() => write(true)}
              aria-expanded="true"
              aria-label="Hide course contents"
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-graphite hover:bg-wash hover:text-ink focus-ring"
            >
              <PanelLeftClose className="size-5" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </>
      )}
    </aside>
  );
}
