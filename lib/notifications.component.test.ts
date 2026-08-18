import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In-app notifications. `after()` is forced onto the no-request-scope path so
 * writes are awaited inline, matching tests/seeds.
 */

const { create, createMany, findMany, count, updateMany } = vi.hoisted(() => ({
  create: vi.fn(),
  createMany: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: () => {
    throw new Error("no request scope");
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    notification: { create, createMany, findMany, count, updateMany },
  },
}));

const {
  notify,
  notifyMany,
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  NOTIFICATION_PAGE_SIZE,
  NOTIFY_CHUNK_SIZE,
} = await import("./notifications");

beforeEach(() => {
  create.mockReset();
  createMany.mockReset();
  findMany.mockReset();
  count.mockReset();
  updateMany.mockReset();
  create.mockResolvedValue({ id: "n1" });
  createMany.mockResolvedValue({ count: 0 });
  findMany.mockResolvedValue([]);
  count.mockResolvedValue(0);
  updateMany.mockResolvedValue({ count: 0 });
});

describe("notify / notifyMany", () => {
  it("writes one row for the addressed user", async () => {
    await notify("user-1", "enrollment", {
      title: "You're enrolled",
      body: "TypeScript Foundations",
      href: "/learn/typescript-foundations",
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        userId: "user-1",
        type: "enrollment",
        payload: {
          title: "You're enrolled",
          body: "TypeScript Foundations",
          href: "/learn/typescript-foundations",
        },
      },
    });
  });

  it("does not throw when the write fails — a notification must not roll back enrollment", async () => {
    create.mockRejectedValueOnce(new Error("notifications table down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notify("user-1", "enrollment", { title: "You're enrolled", body: "X", href: "/learn/x" }),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
  });

  it("dedupes notifyMany so one user is not notified twice for the same send", async () => {
    await notifyMany(["user-1", "user-2", "user-1"], "announcement", {
      title: "Section 4 is live",
      body: "Course",
      href: "/learn/course",
    });

    expect(createMany).toHaveBeenCalledOnce();
    const rows = (createMany.mock.calls[0]?.[0] as { data: { userId: string }[] }).data;
    expect(rows.map((row) => row.userId).sort()).toEqual(["user-1", "user-2"]);
  });

  it("inserts notifyMany in chunks of 500 with skipDuplicates", async () => {
    const userIds = Array.from({ length: NOTIFY_CHUNK_SIZE + 1 }, (_, index) => `user-${index}`);
    await notifyMany(userIds, "announcement", {
      title: "Section 4 is live",
      body: "Course",
      href: "/learn/course",
    });

    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls[0]?.[0]).toMatchObject({
      skipDuplicates: true,
    });
    expect((createMany.mock.calls[0]?.[0] as { data: unknown[] }).data).toHaveLength(
      NOTIFY_CHUNK_SIZE,
    );
    expect((createMany.mock.calls[1]?.[0] as { data: unknown[] }).data).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("listNotifications", () => {
  it("returns only the caller's page and an unread count", async () => {
    const createdAt = new Date("2026-08-17T00:00:00Z");
    findMany.mockResolvedValueOnce([
      {
        id: "n1",
        type: "enrollment",
        payload: { title: "You're enrolled", body: "Course", href: "/learn/x" },
        readAt: null,
        createdAt,
      },
    ]);
    count.mockResolvedValueOnce(3);
    count.mockResolvedValueOnce(21);

    const result = await listNotifications("user-1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        take: NOTIFICATION_PAGE_SIZE,
        skip: 0,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { userId: "user-1", readAt: null } });
    expect(result.unreadCount).toBe(3);
    expect(result.total).toBe(21);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(2);
    expect(result.items).toEqual([
      {
        id: "n1",
        type: "enrollment",
        payload: { title: "You're enrolled", body: "Course", href: "/learn/x" },
        readAt: null,
        createdAt,
      },
    ]);
  });

  it("pages past the first 20 with skip", async () => {
    count.mockResolvedValueOnce(0);
    count.mockResolvedValueOnce(25);
    await listNotifications("user-1", 2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: NOTIFICATION_PAGE_SIZE, take: NOTIFICATION_PAGE_SIZE }),
    );
  });

  it("neutralises a malformed payload rather than throwing", async () => {
    findMany.mockResolvedValueOnce([
      { id: "n1", type: "payment", payload: "not-an-object", readAt: null, createdAt: new Date() },
    ]);
    count.mockResolvedValueOnce(1);
    count.mockResolvedValueOnce(1);

    const result = await listNotifications("user-1");
    expect(result.items[0]?.payload).toEqual({ title: "", body: "", href: "/" });
  });
});

describe("unreadNotificationCount", () => {
  it("is a count-only read so the header does not load the page of rows", async () => {
    count.mockResolvedValueOnce(4);
    await expect(unreadNotificationCount("user-1")).resolves.toBe(4);
    expect(count).toHaveBeenCalledWith({ where: { userId: "user-1", readAt: null } });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("mark read", () => {
  it("scopes a single mark to the owning user so you cannot clear someone else's bell", async () => {
    await markNotificationRead("user-1", "n-other");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "n-other", userId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("marks every unread row for that user only", async () => {
    await markAllNotificationsRead("user-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
