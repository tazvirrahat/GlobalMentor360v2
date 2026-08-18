import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/site/empty-state";
import { Button } from "@/components/ui/button";
import { listNotifications } from "@/lib/notifications";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { markAllRead, openNotification } from "./actions";
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
  const { items, unreadCount, page, pageCount } = await listNotifications(user.id, rawPage);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            {items.length === 0
              ? "Enrolments, payments, and replies land here."
              : unreadCount === 0
                ? "You're up to date."
                : `${unreadCount} unread`}
          </p>
        </div>
        {unreadCount > 0 ? (
          <form action={markAllRead}>
            <Button type="submit" variant="outline" size="sm">
              Mark all read
            </Button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState
          className="mt-10 gap-3"
          icon={<Bell className="size-8 text-muted-foreground" aria-hidden />}
          message="Nothing yet."
        >
          <Button asChild variant="outline">
            <Link href="/courses">Browse courses</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <ul className="mt-8 flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <form action={openNotification}>
                  <input type="hidden" name="notificationId" value={item.id} />
                  <input type="hidden" name="href" value={item.payload.href} />
                  <button
                    type="submit"
                    className="w-full rounded-2xl border p-4 text-left hover:bg-accent"
                  >
                    <p className={item.readAt ? "text-sm" : "text-sm font-semibold"}>
                      {item.payload.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.payload.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <PageNav pathname="/notifications" page={page} pageCount={pageCount} />
        </>
      )}
    </main>
  );
}
