import type { Route } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Header bell. The menu used to embed 20 notification rows on every page; the
 * badge is now a count-only read and the list lives on /notifications.
 */
export function NotificationsMenu({ unreadCount }: { unreadCount: number }) {
  return (
    <Button asChild variant="ghost" size="icon" className="size-11" aria-label="Notifications">
      <Link
        href={"/notifications" as Route}
        className="relative flex size-11 items-center justify-center"
      >
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
