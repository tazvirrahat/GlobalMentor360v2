import type { Route } from "next";
import Link from "next/link";
import { GraduationCap, ShoppingCart, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cartItemCount } from "@/lib/cart";
import { unreadNotificationCount } from "@/lib/notifications";
import { getCurrentUser, getUserRoles } from "@/lib/session";
import { NotificationsMenu } from "./notifications-menu";

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
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 sm:min-h-16 sm:gap-x-4 sm:px-6">
        <Link href="/" className="flex min-h-11 min-w-0 shrink-0 items-center gap-2 font-extrabold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand text-primary-foreground">
            <GraduationCap className="size-4.5" aria-hidden />
          </span>
          <span className="text-base sm:text-lg">
            <span className="sm:hidden">GM</span>
            <span className="hidden sm:inline">GlobalMentor</span>
            <span className="text-brand">360</span>
          </span>
        </Link>

        <nav className="flex min-w-0 items-center gap-0.5 text-sm font-medium">
          <Link
            href="/courses"
            className="inline-flex min-h-11 items-center rounded-md px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Courses
          </Link>
          {isStaff ? (
            <Link
              href="/studio"
              className="inline-flex min-h-11 items-center rounded-md px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Studio
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              href="/admin/payments"
              className="inline-flex min-h-11 items-center rounded-md px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          {user ? (
            <>
              <Button asChild variant="ghost" size="icon" className="size-11" aria-label="Cart">
                <Link
                  href={"/cart" as Route}
                  className="relative flex size-11 items-center justify-center"
                >
                  <ShoppingCart className="size-4" />
                  {cartCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                      {cartCount > 9 ? "9+" : cartCount}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <NotificationsMenu unreadCount={unreadCount} />
              <Button asChild variant="ghost" size="icon" className="size-11 sm:hidden" aria-label="Account">
                <Link href={"/account" as Route} className="flex size-11 items-center justify-center">
                  <UserRound className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="hidden min-h-11 sm:inline-flex">
                <Link href={"/account" as Route}>Account</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <Link href="/dashboard">
                  <span className="sm:hidden">Learn</span>
                  <span className="hidden sm:inline">My learning</span>
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="min-h-11">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="min-h-11 shadow-brand">
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
