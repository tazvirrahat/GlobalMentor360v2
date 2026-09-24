import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/site/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listNotifications, NOTIFICATION_PAGE_SIZE } from "@/lib/notifications";
import { showingRange } from "@/lib/pagination";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/session";
import { markAllRead, markOneRead, openNotification } from "./actions";
import { PageNav } from "@/components/site/page-nav";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser("/notifications");
  const { page: rawPage } = await searchParams;
  const { items, unreadCount, page, pageCount, total } = await listNotifications(user.id, rawPage);
  const range = showingRange(page, NOTIFICATION_PAGE_SIZE, total);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            {items.length === 0
              ? "Enrolments, payments, and replies land here."
              : unreadCount === 0
                ? "You're up to date."
                : `${unreadCount} unread`}
          </p>
          {total > 0 ? (
            <p className="mt-2 text-sm tabular-nums text-muted-foreground">
              Showing {range.from}–{range.to} of {total} · {NOTIFICATION_PAGE_SIZE} per page
            </p>
          ) : null}
        </div>
        {unreadCount > 0 ? (
          <form action={markAllRead}>
            <Button type="submit" variant="outline">
              Mark all read
            </Button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<Bell className="size-6" aria-hidden />}
          title="No notifications"
          message="Nothing yet."
        >
          <Button asChild>
            <Link href="/courses" className="cursor-pointer">
              Browse courses
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <ul className="mt-6 overflow-hidden rounded-lg border bg-card shadow-xs">
            {items.map((item) => {
              const unread = !item.readAt;
              return (
                <li key={item.id} className="border-b last:border-b-0">
                  <div
                    className={cn(
                      "flex flex-col sm:flex-row",
                      unread && "border-l-4 border-l-primary",
                    )}
                  >
                    <form action={openNotification} className="min-w-0 flex-1">
                      <input type="hidden" name="notificationId" value={item.id} />
                      <input type="hidden" name="href" value={item.payload.href} />
                      <button
                        type="submit"
                        className="flex min-h-12 w-full cursor-pointer flex-col justify-center gap-0.5 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "min-w-0 truncate text-sm",
                              unread ? "font-semibold text-foreground" : "font-normal",
                            )}
                          >
                            {item.payload.title}
                          </span>
                          {unread ? <Badge variant="secondary">Unread</Badge> : null}
                        </span>
                        <span className="line-clamp-1 text-sm text-muted-foreground">
                          {item.payload.body}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </button>
                    </form>
                    {unread ? (
                      <form
                        action={markOneRead}
                        className="flex items-center border-t px-2 py-1 sm:border-t-0 sm:border-l sm:px-3"
                      >
                        <input type="hidden" name="notificationId" value={item.id} />
                        <Button type="submit" variant="ghost" size="sm" className="h-11 w-full sm:w-auto">
                          Mark as read
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {pageCount > 1 ? (
            <div className="mt-2 rounded-lg border bg-card px-4 py-4 shadow-sm [&_nav]:mt-3">
              <p className="text-center text-sm font-medium tabular-nums">
                Page {page} of {pageCount} · {NOTIFICATION_PAGE_SIZE} per page
              </p>
              <PageNav pathname="/notifications" page={page} pageCount={pageCount} />
            </div>
          ) : (
            <PageNav pathname="/notifications" page={page} pageCount={pageCount} />
          )}
        </>
      )}
    </main>
  );
}
