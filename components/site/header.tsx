import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { cartItemCount } from "@/lib/cart";
import { unreadNotificationCount } from "@/lib/notifications";
import { getCurrentUser, getUserRoles } from "@/lib/session";
import { HeaderActions, HeaderNav } from "./header-nav";

/**
 * Session-aware site chrome. A server component on purpose: the nav depends on
 * roles, and roles must never be decided client-side.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();
  const roles = user ? await getUserRoles(user.id) : [];

  const isStaff = roles.includes("INSTRUCTOR") || roles.includes("ADMIN");
  const isAdmin = roles.includes("ADMIN");

  const [cartCount, unreadCount] = user
    ? await Promise.all([cartItemCount(user.id), unreadNotificationCount(user.id)])
    : [0, 0];

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 sm:min-h-16 sm:gap-x-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex min-h-11 min-w-0 shrink-0 cursor-pointer items-center gap-2 font-heading font-semibold tracking-tight"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="size-4" aria-hidden />
          </span>
          <span className="text-base sm:text-lg">
            <span className="sm:hidden">GM</span>
            <span className="hidden sm:inline">GlobalMentor</span>
            <span className="text-primary">360</span>
          </span>
        </Link>

        <HeaderNav isStaff={isStaff} isAdmin={isAdmin} />
        <HeaderActions signedIn={Boolean(user)} cartCount={cartCount} unreadCount={unreadCount} />
      </div>
    </header>
  );
}
