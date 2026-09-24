import type { ReactNode } from "react";

/**
 * Focus mode: no site header or footer. The player page draws its own top bar
 * and curriculum rail (components/learn/learn-shell.tsx), because a layout
 * cannot see which lesson is open.
 */
export default function LearnLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-paper">{children}</div>;
}
