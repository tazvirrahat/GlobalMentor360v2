import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * An empty list: what is missing and what to do next. A plain panel — no icon
 * in a tinted disc (spec §4 bans that look).
 */
export function EmptyState({
  title,
  message,
  children,
  className,
  headingLevel = 2,
}: {
  title?: ReactNode;
  message?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const TitleTag = headingLevel === 3 ? "h3" : "h2";

  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-6", className)}>
      {title ? <TitleTag className="text-lg font-semibold">{title}</TitleTag> : null}
      {message ? <p className="max-w-[60ch] text-graphite">{message}</p> : null}
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}
