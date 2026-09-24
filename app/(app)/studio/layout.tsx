import type { ReactNode } from "react";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: ReactNode }) {
  await requireRole("INSTRUCTOR", "ADMIN");
  return children;
}
