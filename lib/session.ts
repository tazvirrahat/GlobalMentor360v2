import type { Route } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveViewAs } from "@/lib/impersonation";
import { safeReturnPath } from "@/lib/urls";
import { VIEW_AS_COOKIE } from "@/lib/view-as-cookie";
import type { Role, UserStatus } from "@/generated/prisma/enums";

export { safeReturnPath };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  /** Set while an admin is viewing the site as this person (read-only; see lib/impersonation). */
  viewingAs?: { adminId: string; expiresAt: Date };
};

/** Current session, or null when signed out. Safe to call from any server component. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Only ACTIVE accounts may hold an app session. SUSPENDED and DELETED are signed out. */
export function isActiveUserStatus(status: UserStatus): boolean {
  return status === "ACTIVE";
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session?.user) return null;

  const row = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, status: true },
  });
  if (!row || !isActiveUserStatus(row.status)) return null;

  // An admin viewing the site as someone: everything downstream sees that
  // person. proxy.ts keeps it read-only.
  const grant = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (grant) {
    const viewAs = await resolveViewAs(row.id, grant);
    if (viewAs) return { ...viewAs.target, viewingAs: { adminId: viewAs.adminId, expiresAt: viewAs.expiresAt } };
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
  };
}

/** Redirects to sign-in when signed out. Use in pages, not in API routes. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const safe = safeReturnPath(returnTo);
    // typedRoutes cannot validate a string built at runtime; the base path is a
    // literal and the query is encoded, so the cast is contained.
    const target = safe ? (`/sign-in?next=${encodeURIComponent(safe)}` as Route) : "/sign-in";
    redirect(target);
  }
  return user;
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const rows = await db.userRole.findMany({
    where: { userId },
    select: { role: true },
  });
  return rows.map((row) => row.role);
}

export async function hasRole(userId: string, role: Role): Promise<boolean> {
  const match = await db.userRole.findUnique({
    where: { userId_role: { userId, role } },
    select: { role: true },
  });
  return match !== null;
}

/**
 * Requires one of the given roles. ADMIN is not implicitly granted every role —
 * if an admin should be able to do something, say so explicitly at the call site.
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  const held = await getUserRoles(user.id);

  if (!roles.some((role) => held.includes(role))) {
    redirect("/");
  }

  return user;
}
