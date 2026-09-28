import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PageNav } from "@/components/site/page-nav";
import { Button } from "@/components/ui/button";
import { formatTimeOfDay, groupByDay } from "@/lib/day-groups";
import { listNotifications, NOTIFICATION_PAGE_SIZE } from "@/lib/notifications";
import { showingRange } from "@/lib/pagination";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { markAllRead, markOneRead, openNotification } from "./actions";
import { getViewerTimeZone } from "@/lib/viewer-time";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/**
 * The bell's full list, grouped by calendar day in the viewer's time zone. Unread items carry
 * an ink dot (and "Unread" for screen readers); opening one marks it read.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser("/notifications");
  const { page: rawPage } = await searchParams;
  const { items, unreadCount, page, pageCount, total } = await listNotifications(user.id, rawPage);
  const range = showingRange(page, NOTIFICATION_PAGE_SIZE, total);
  const timeZone = await getViewerTimeZone();
  const groups = groupByDay(items, new Date(), timeZone);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold sm:text-4xl">Notifications</h1>
          {total > 0 ? (
            <p className="text-lg text-graphite">
              {unreadCount === 0 ? "You're all caught up." : `${unreadCount} unread`}
            </p>
          ) : null}
        </div>
        {unreadCount > 0 ? (
          <form action={markAllRead}>
            <Button type="submit" variant="secondary">
              Mark all read
            </Button>
          </form>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-6">
          <h2 className="text-lg font-semibold">No notifications yet</h2>
          <p className="text-graphite">
            When you enrol in a course, pay for one, or get a reply to a question, you&apos;ll see it here.
          </p>
          <Button asChild>
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.day} aria-labelledby={`day-${group.day}`} className="flex flex-col gap-2">
              <h2 id={`day-${group.day}`} className="text-sm font-semibold text-graphite">
                {group.label}
              </h2>
              <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-surface">
                {group.items.map((item) => {
                  const unread = !item.readAt;
                  return (
                    <li key={item.id} className="flex items-center gap-1 pr-2 hover:bg-wash/60">
                      <form action={openNotification} className="min-w-0 flex-1">
                        <input type="hidden" name="notificationId" value={item.id} />
                        <input type="hidden" name="href" value={item.payload.href} />
                        <button
                          type="submit"
                          className="flex min-h-14 w-full cursor-pointer items-start gap-3 py-3 pr-2 pl-4 text-left focus-ring-inset"
                        >
                          <span
                            aria-hidden
                            className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-ink" : "bg-transparent")}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className={cn("truncate text-ink", unread ? "font-semibold" : "font-medium")}>
                                {unread ? <span className="sr-only">Unread: </span> : null}
                                {item.payload.title}
                              </span>
                              <time
                                dateTime={item.createdAt.toISOString()}
                                className="shrink-0 text-sm text-graphite"
                              >
                                {formatTimeOfDay(item.createdAt, timeZone)}
                              </time>
                            </span>
                            {item.payload.body ? (
                              <span className="line-clamp-1 text-sm text-graphite">{item.payload.body}</span>
                            ) : null}
                          </span>
                        </button>
                      </form>
                      {unread ? (
                        <form action={markOneRead} className="shrink-0">
                          <input type="hidden" name="notificationId" value={item.id} />
                          {/* An icon on phones, so the title keeps the width; the name is the same. */}
                          <Button type="submit" variant="ghost" size="sm" className="max-sm:w-8 max-sm:px-0">
                            <Check aria-hidden className="sm:hidden" />
                            <span className="max-sm:sr-only">Mark as read</span>
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {pageCount > 1 ? (
            <p className="text-sm text-graphite">
              Showing {range.from} to {range.to} of {total}
            </p>
          ) : null}
          <PageNav pathname="/notifications" page={page} pageCount={pageCount} />
        </>
      )}
    </main>
  );
}
