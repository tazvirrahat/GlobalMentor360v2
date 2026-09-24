import type { ReactNode } from "react";
import { requireRole } from "@/lib/session";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole("ADMIN");

  return (
    <div className="min-h-[50vh] min-w-0 bg-background">
      <AdminNav />
      {children}
    </div>
  );
}
