import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { accountLinks } from "@/lib/nav";
import { getUserRoles, requireRole } from "@/lib/session";
import { getSite } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Studio and admin share one app shell. Each area's own layout (and every page)
 * keeps its role check; this one only needs to know which sections to show.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const roles = await getUserRoles(user.id);

  return (
    <AppShell
      siteName={getSite().name}
      roles={roles}
      user={{ name: user.name, email: user.email }}
      accountLinks={accountLinks({ signedIn: true, roles })}
    >
      {children}
    </AppShell>
  );
}
