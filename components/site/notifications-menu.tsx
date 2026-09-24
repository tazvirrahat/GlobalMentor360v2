import type { Route } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Header bell. The menu used to embed 20 notification rows on every page; the
 * badge is now a count-only read and the list lives on /notifications.
 */
export function NotificationsMenu({ unreadCount }: { unreadCount: number }) {
  const label =
    unreadCount > 0
      ? `Notifications, ${unreadCount} unread`
      : "Notifications";

  return (
    <Button asChild variant="ghost" size="icon-lg" aria-label={label}>
      <Link
        href={"/notifications" as Route}
        className="relative flex size-11 cursor-pointer items-center justify-center"
      >
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span aria-hidden
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-xs font-semibold tabular-nums text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
