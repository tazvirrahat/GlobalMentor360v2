"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Phones: once the purchase panel has scrolled out of view, a bar pinned to the
 * bottom keeps the price and the main action in reach. Hidden (not just
 * invisible) while the panel is on screen, so the action is never announced
 * twice; desktop has the sticky panel instead.
 */
export function PurchaseBar({ panelId, children }: { panelId: string; children: ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const observer = new IntersectionObserver(([entry]) => {
      // Only once the panel has gone above the viewport, not before it is reached.
      setShow(!entry!.isIntersecting && entry!.boundingClientRect.bottom < 0);
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panelId]);

  return (
    <div
      hidden={!show}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">{children}</div>
    </div>
  );
}
