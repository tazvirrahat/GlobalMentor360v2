import type { ReactNode } from "react";
import { requireRole } from "@/lib/session";
import { StudioNav } from "./studio-nav";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: ReactNode }) {
  await requireRole("INSTRUCTOR", "ADMIN");

  return (
    <div className="min-h-[50vh] bg-background">
      <StudioNav />
      {children}
    </div>
  );
}
