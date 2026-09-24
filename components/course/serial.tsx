"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIZES = { sm: "text-sm", md: "text-base", lg: "text-lg" } as const;

/**
 * A string people read aloud or type exactly: a certificate number, a bKash
 * transaction ID, an order number. IBM Plex Mono (the only monospace in the
 * product), selectable in one click, with an optional copy button whose result
 * is announced.
 */
export function Serial({
  value,
  copyLabel,
  size = "md",
  className,
}: {
  value: string;
  /** Names the thing for the copy button ("certificate number"). Omit for no button. */
  copyLabel?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <span className={cn("inline-flex max-w-full items-center gap-1", className)}>
      <code className={cn("min-w-0 font-mono font-medium [overflow-wrap:anywhere] text-ink select-all", SIZES[size])}>{value}</code>
      {copyLabel ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={copy}
            aria-label={`Copy ${copyLabel}`}
            className="shrink-0 text-graphite hover:text-ink"
          >
            {status === "copied" ? <Check className="text-verified" aria-hidden /> : <Copy aria-hidden />}
          </Button>
          <span role="status" className="sr-only">
            {status === "copied" ? "Copied" : status === "failed" ? "Could not copy. Select the text instead." : ""}
          </span>
        </>
      ) : null}
    </span>
  );
}
