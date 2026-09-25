import { cn } from "@/lib/utils";

/**
 * A horizontal bar for a number that is already written next to it (analytics
 * tables). Decorative: hidden from assistive tech, so the number is the content.
 */
export function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span aria-hidden className={cn("block h-2 w-full overflow-hidden rounded-full bg-wash", className)}>
      <span className="block h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
    </span>
  );
}
