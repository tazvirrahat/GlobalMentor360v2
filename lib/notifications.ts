import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { clampPage, pageCount, skipTake, type Paged } from "@/lib/pagination";

/**
 * In-app notifications. Email remains a separate delivery channel (lib/email);
 * this is the bell in the header.
 *
 * Writes never throw: a failed notification must not roll back an enrollment,
 * a Q&A reply, or an announcement — the same rule as lib/analytics.
 */

export type NotificationType = "enrollment" | "announcement" | "qa_reply" | "payment" | "course_review";

export type NotificationPayload = {
  title: string;
  body: string;
  href: string;
};

export type AppNotification = {
  id: string;
  type: string;
  payload: NotificationPayload;
  readAt: Date | null;
  createdAt: Date;
};

function asPayload(value: Prisma.JsonValue): NotificationPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { title: "", body: "", href: "/" };
  }
  const record = value as Record<string, unknown>;
  return {
    title: typeof record.title === "string" ? record.title : "",
    body: typeof record.body === "string" ? record.body : "",
    href: typeof record.href === "string" ? record.href : "/",
  };
}

async function write(
  userId: string,
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId,
        type,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error(`notifications: failed to record ${type}`, error);
  }
}

/** Recipients per createMany. Matches MAX_INLINE_RECIPIENTS so one announcement is one batch. */
export const NOTIFY_CHUNK_SIZE = 500;

async function writeMany(
  userIds: string[],
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  if (userIds.length === 0) return;
  const row = {
    type,
    payload: payload as Prisma.InputJsonValue,
  };

  try {
    for (let index = 0; index < userIds.length; index += NOTIFY_CHUNK_SIZE) {
      const chunk = userIds.slice(index, index + NOTIFY_CHUNK_SIZE);
      await db.notification.createMany({
        data: chunk.map((userId) => ({ userId, ...row })),
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.error(`notifications: failed to record ${type}`, error);
  }
}

export async function notify(
  userId: string,
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  try {
    after(() => write(userId, type, payload));
  } catch {
    await write(userId, type, payload);
  }
}

export async function notifyMany(
  userIds: string[],
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  const unique = [...new Set(userIds)];
  try {
    after(() => writeMany(unique, type, payload));
  } catch {
    await writeMany(unique, type, payload);
  }
}

export const NOTIFICATION_PAGE_SIZE = 20;

export type NotificationPage = Paged<AppNotification> & { unreadCount: number };

export async function unreadNotificationCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, page?: string | number): Promise<NotificationPage> {
  const requested = page ?? 1;
  const where = { userId };

  const [unreadCount, total] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.count({ where }),
  ]);

  const current = clampPage(requested, total, NOTIFICATION_PAGE_SIZE);
  const { skip, take } = skipTake(current, NOTIFICATION_PAGE_SIZE);

  const rows = await db.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
    select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
  });

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: asPayload(row.payload),
      readAt: row.readAt,
      createdAt: row.createdAt,
    })),
    unreadCount,
    total,
    page: current,
    pageCount: pageCount(total, NOTIFICATION_PAGE_SIZE),
  };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await db.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
