import { db } from "@/lib/db";
import { decodeViewAs, encodeViewAs, VIEW_AS_MINUTES } from "@/lib/view-as-cookie";

/**
 * Admin "view as" (features plan 16, scope confirmed by the owner: view-only).
 * An admin sees the site as one person for up to 30 minutes. The grant is a
 * signed cookie checked here on every request; proxy.ts refuses every write
 * while it is live. Start and stop are audited.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; message: string };

function secret(): string | null {
  return process.env.BETTER_AUTH_SECRET?.trim() || null;
}

async function isActiveAdmin(userId: string): Promise<boolean> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { status: true, roles: { where: { role: "ADMIN" }, select: { role: true } } },
  });
  return Boolean(row && row.status === "ACTIVE" && row.roles.length > 0);
}

/** Who may be viewed as: an active account that is not an admin and not yourself. */
export async function canViewAs(adminId: string, targetId: string): Promise<Result<{ target: { id: string; name: string } }>> {
  if (adminId === targetId) return { ok: false, message: "You can't view the site as yourself." };
  if (!(await isActiveAdmin(adminId))) return { ok: false, message: "Only admins can do this." };
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, status: true, roles: { where: { role: "ADMIN" }, select: { role: true } } },
  });
  if (!target || target.status === "DELETED") return { ok: false, message: "User not found." };
  if (target.status !== "ACTIVE") return { ok: false, message: "A suspended account can't be viewed as." };
  if (target.roles.length > 0) return { ok: false, message: "Admins can't be viewed as." };
  return { ok: true, target: { id: target.id, name: target.name } };
}

export async function startViewAs(
  adminId: string,
  targetId: string,
  now: number = Date.now(),
): Promise<Result<{ cookie: string; expiresAt: Date; targetName: string }>> {
  const key = secret();
  if (!key) return { ok: false, message: "This needs BETTER_AUTH_SECRET to be set." };
  const allowed = await canViewAs(adminId, targetId);
  if (!allowed.ok) return allowed;
  const expiresAt = now + VIEW_AS_MINUTES * 60 * 1000;
  await db.auditLog.create({
    data: {
      actorId: adminId,
      action: "impersonation.start",
      targetType: "user",
      targetId,
      metadata: { mode: "view-only", expiresAt: new Date(expiresAt).toISOString() },
    },
  });
  return {
    ok: true,
    cookie: encodeViewAs({ adminId, targetId, expiresAt }, key),
    expiresAt: new Date(expiresAt),
    targetName: allowed.target.name,
  };
}

/** Records the end of a grant (expired ones too, so the log shows the stop). Returns the person who was viewed. */
export async function stopViewAs(realUserId: string, raw: string | undefined): Promise<string | null> {
  const key = secret();
  const grant = key ? decodeViewAs(raw, key, 0) : null;
  if (!grant || grant.adminId !== realUserId) return null;
  await db.auditLog.create({
    data: { actorId: realUserId, action: "impersonation.stop", targetType: "user", targetId: grant.targetId },
  });
  return grant.targetId;
}

export type ViewAs = { target: { id: string; email: string; name: string }; adminId: string; expiresAt: Date };

/**
 * The person to show the site as, when the cookie is valid for this signed-in
 * admin and every rule still holds (they may have been suspended, or lost the
 * admin role, since it started). Null means: ignore the cookie.
 */
export async function resolveViewAs(realUserId: string, raw: string | undefined, now: number = Date.now()): Promise<ViewAs | null> {
  const key = secret();
  const grant = key ? decodeViewAs(raw, key, now) : null;
  if (!grant || grant.adminId !== realUserId) return null;
  const allowed = await canViewAs(realUserId, grant.targetId);
  if (!allowed.ok) return null;
  const target = await db.user.findUnique({ where: { id: grant.targetId }, select: { id: true, email: true, name: true } });
  if (!target) return null;
  return { target, adminId: realUserId, expiresAt: new Date(grant.expiresAt) };
}
