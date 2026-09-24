"use client";

import { useState, type ReactNode } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { PlayerTab } from "@/lib/player";
import { cn } from "@/lib/utils";

export type PlayerTabSpec = { value: PlayerTab; label: string; count?: number; panel: ReactNode };

/**
 * Overview, Q&A, Notes and Announcements under the lesson (spec §5). Radix
 * gives the ARIA tabs pattern (arrow keys, Home/End); only the selected panel
 * is mounted; the choice is mirrored into ?tab= with history.replaceState, so
 * it deep-links and survives a reload without a server round trip.
 */
export function PlayerTabs({ initial, tabs }: { initial: PlayerTab; tabs: PlayerTabSpec[] }) {
  const [value, setValue] = useState<PlayerTab>(initial);

  function select(next: string) {
    setValue(next as PlayerTab);
    const url = new URL(window.location.href);
    if (next === tabs[0]?.value) url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <TabsPrimitive.Root value={value} onValueChange={select} className="flex flex-col gap-5">
      <TabsPrimitive.List
        aria-label="About this lesson"
        className="-mx-4 flex overflow-x-auto overscroll-x-contain border-b border-rule px-4 sm:mx-0 sm:px-0"
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              "relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium whitespace-nowrap text-graphite -outline-offset-2 hover:text-ink focus-ring-inset",
              "data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="rounded-sm bg-wash px-1.5 text-xs font-semibold text-ink">
                <span className="sr-only">, </span>
                {tab.count}
              </span>
            ) : null}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((tab) => (
        <TabsPrimitive.Content key={tab.value} value={tab.value} className="focus-ring">
          {tab.panel}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
