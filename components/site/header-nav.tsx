"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NotificationsMenu } from "./notifications-menu";

const LINK_BASE =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm transition-colors duration-150 focus-ring";

function isActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navClass(active: boolean) {
  return cn(
    LINK_BASE,
    active
      ? "bg-muted font-semibold text-foreground"
      : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

export function HeaderNav({ isStaff, isAdmin }: { isStaff: boolean; isAdmin: boolean }) {
  const pathname = usePathname();
  const coursesActive = isActive("/courses", pathname);
  const studioActive = isActive("/studio", pathname);
  const adminActive = isActive("/admin", pathname);

  return (
    <nav className="flex min-w-0 items-center gap-0.5 text-sm font-medium">
      <Link href="/courses" aria-current={coursesActive ? "page" : undefined} className={navClass(coursesActive)}>
        Courses
      </Link>
      {isStaff ? (
        <Link href="/studio" aria-current={studioActive ? "page" : undefined} className={navClass(studioActive)}>
          Studio
        </Link>
      ) : null}
      {isAdmin ? (
        <Link
          href="/admin/payments"
          aria-current={adminActive ? "page" : undefined}
          className={navClass(adminActive)}
        >
          Admin
        </Link>
      ) : null}
    </nav>
  );
}

export function HeaderActions({
  signedIn,
  cartCount,
  unreadCount,
}: {
  signedIn: boolean;
  cartCount: number;
  unreadCount: number;
}) {
  const pathname = usePathname();
  const accountActive = isActive("/account", pathname);
  const learningActive = pathname === "/dashboard" || isActive("/learn", pathname);
  const signInActive = isActive("/sign-in", pathname);
  const cartLabel =
    cartCount === 1 ? "Cart, 1 item" : cartCount > 0 ? `Cart, ${cartCount} items` : "Cart";

  if (!signedIn) {
    return (
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1 sm:gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className={cn("min-h-11", signInActive && "bg-muted font-semibold text-foreground")}
        >
          <Link
            href="/sign-in"
            className="cursor-pointer"
            aria-current={signInActive ? "page" : undefined}
          >
            Sign in
          </Link>
        </Button>
        <Button asChild size="sm" className="min-h-11">
          <Link href="/sign-up" className="cursor-pointer">
            Get started
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-1 sm:gap-2">
      <Button asChild variant="ghost" size="icon-lg" aria-label={cartLabel}>
        <Link
          href={"/cart" as Route}
          className="relative flex size-11 cursor-pointer items-center justify-center"
        >
          <ShoppingCart className="size-4" />
          {cartCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          ) : null}
        </Link>
      </Button>
      <NotificationsMenu unreadCount={unreadCount} />
      <Button
        asChild
        variant="ghost"
        size="icon-lg"
        className="sm:hidden"
        aria-label="Account"
      >
        <Link
          href={"/account" as Route}
          className="flex size-11 cursor-pointer items-center justify-center"
          aria-current={accountActive ? "page" : undefined}
        >
          <UserRound className="size-4" />
        </Link>
      </Button>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className={cn(
          "hidden min-h-11 sm:inline-flex",
          accountActive && "bg-muted font-semibold text-foreground",
        )}
      >
        <Link
          href={"/account" as Route}
          className="cursor-pointer"
          aria-current={accountActive ? "page" : undefined}
        >
          Account
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        size="sm"
        className={cn("min-h-11", learningActive && "bg-muted font-semibold text-foreground")}
      >
        <Link
          href="/dashboard"
          className="cursor-pointer"
          aria-current={learningActive ? "page" : undefined}
        >
          <span className="sm:hidden">Learn</span>
          <span className="hidden sm:inline">My learning</span>
        </Link>
      </Button>
    </div>
  );
}
