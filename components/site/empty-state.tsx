import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  message,
  children,
  className,
  headingLevel = 2,
}: {
  icon: ReactNode;
  title?: ReactNode;
  message?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const TitleTag = headingLevel === 3 ? "h3" : "h2";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-muted/40 px-8 py-12 text-center",
        className,
      )}
    >
      <span
        className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden
      >
        {icon}
      </span>
      {title ? (
        <TitleTag className="font-heading text-lg font-semibold tracking-tight">{title}</TitleTag>
      ) : null}
      {message ? <p className="max-w-sm text-muted-foreground">{message}</p> : null}
      {children}
    </div>
  );
}
