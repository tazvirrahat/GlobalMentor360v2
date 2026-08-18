import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  message,
  children,
  className,
}: {
  icon: ReactNode;
  message?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border border-dashed p-10 text-center",
        className,
      )}
    >
      {icon}
      {message ? <p className="max-w-sm text-muted-foreground">{message}</p> : null}
      {children}
    </div>
  );
}
