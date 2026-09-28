import type { ReactNode } from "react";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole("ADMIN");
  return children;
}
