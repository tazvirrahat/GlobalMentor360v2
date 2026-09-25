"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bell, LogOut, Menu, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { isActivePath, PRIMARY_NAV, type NavLink } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { AccountMenu, InitialsAvatar, useSignOut } from "./account-menu";

type User = { name: string; email: string };

function countLabel(noun: string, count: number, unit: string) {
  if (count <= 0) return noun;
  return `${noun}, ${count} ${unit}`;
}

/** Count bubble on an icon button. Hidden from assistive tech: the button's name says the count. */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-xs font-semibold text-white tabular-nums ring-2 ring-surface"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function IconLink({ href, label, count, children }: { href: string; label: string; count: number; children: React.ReactNode }) {
  return (
    <Link
      href={href as Route}
      aria-label={label}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-wash focus-ring"
    >
      {children}
      <CountBadge count={count} />
    </Link>
  );
}

export function SiteHeaderBar({
  siteName,
  user,
  accountLinks,
  cartCount,
  unreadCount,
}: {
  siteName: string;
  user: User | null;
  accountLinks: NavLink[];
  cartCount: number;
  unreadCount: number;
}) {
  const pathname = usePathname();
  const cartLabel = countLabel("Cart", cartCount, cartCount === 1 ? "item" : "items");
  const bellLabel = countLabel("Notifications", unreadCount, "unread");
  const learningActive = isActivePath("/dashboard", pathname) || isActivePath("/learn", pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mr-2 inline-flex min-h-11 shrink-0 items-center rounded-sm text-lg font-bold text-ink focus-ring"
        >
          {siteName}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {PRIMARY_NAV.map((link) => {
            const active = isActivePath(link.href, pathname);
            return (
              <Link
                key={link.href}
                href={link.href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-wash hover:text-ink focus-ring",
                  active
                    ? "text-ink after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-ink"
                    : "text-graphite",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {user ? (
            <>
              <Link
                href="/dashboard"
                aria-current={learningActive ? "page" : undefined}
                className={cn(
                  "hidden min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-wash focus-ring md:inline-flex",
                  learningActive ? "bg-wash text-ink" : "text-ink",
                )}
              >
                My learning
              </Link>
              <IconLink href="/cart" label={cartLabel} count={cartCount}>
                <ShoppingCart className="size-5" strokeWidth={1.75} aria-hidden />
              </IconLink>
              <span className="hidden md:inline-flex">
                <IconLink href="/notifications" label={bellLabel} count={unreadCount}>
                  <Bell className="size-5" strokeWidth={1.75} aria-hidden />
                </IconLink>
              </span>
              <span className="hidden md:inline-flex">
                <AccountMenu name={user.name} email={user.email} links={accountLinks} />
              </span>
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button asChild variant="ghost" size="lg">
                <Link href="/sign-in" aria-current={isActivePath("/sign-in", pathname) ? "page" : undefined}>
                  Sign in
                </Link>
              </Button>
              <Button asChild size="lg">
                <Link href="/sign-up">Create account</Link>
              </Button>
            </div>
          )}
          <PhoneMenu
            user={user}
            accountLinks={accountLinks}
            unreadCount={unreadCount}
            cartCount={cartCount}
            pathname={pathname}
          />
        </div>
      </div>
    </header>
  );
}

const SHEET_LINK =
  "flex min-h-12 items-center justify-between gap-3 rounded-md px-3 text-base font-medium text-ink hover:bg-wash focus-ring";

function SheetLink({ link, pathname, trailing }: { link: NavLink; pathname: string; trailing?: React.ReactNode }) {
  const active = isActivePath(link.href, pathname);
  return (
    <li>
      <SheetClose asChild>
        <Link
          href={link.href as Route}
          aria-current={active ? "page" : undefined}
          className={cn(SHEET_LINK, active && "bg-wash font-semibold")}
        >
          <span>{link.label}</span>
          {trailing}
        </Link>
      </SheetClose>
    </li>
  );
}

/** Below md: one "Menu" button opening a sheet with every top-bar and account link. */
function PhoneMenu({
  user,
  accountLinks,
  unreadCount,
  cartCount,
  pathname,
}: {
  user: User | null;
  accountLinks: NavLink[];
  unreadCount: number;
  cartCount: number;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, signOut } = useSignOut();
  const menuLabel = unreadCount > 0 ? `Menu, ${unreadCount} unread notifications` : "Menu";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="lg" className="relative px-3 md:hidden" aria-label={menuLabel}>
          <Menu className="size-5" strokeWidth={1.75} aria-hidden />
          <span aria-hidden>Menu</span>
          {unreadCount > 0 ? (
            <span aria-hidden className="absolute top-2 right-1.5 size-2 rounded-full bg-ink ring-2 ring-surface" />
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" title="Menu">
        <div className="flex flex-col gap-4 p-3">
          {user ? (
            <div className="flex items-center gap-3 px-3 py-1">
              <InitialsAvatar name={user.name} email={user.email} className="size-10 text-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{user.name || user.email}</p>
                <p className="truncate text-xs text-graphite">{user.email}</p>
              </div>
            </div>
          ) : null}

          <nav aria-label="Main">
            <ul className="flex flex-col">
              {PRIMARY_NAV.map((link) => (
                <SheetLink key={link.href} link={link} pathname={pathname} />
              ))}
            </ul>
          </nav>

          {user ? (
            <nav aria-label="Your learning" className="border-t border-rule pt-3">
              <ul className="flex flex-col">
                <SheetLink link={{ href: "/dashboard", label: "My learning" }} pathname={pathname} />
                <SheetLink
                  link={{ href: "/notifications", label: "Notifications" }}
                  pathname={pathname}
                  trailing={
                    unreadCount > 0 ? (
                      <span className="text-sm text-graphite tabular-nums">{unreadCount} unread</span>
                    ) : null
                  }
                />
                <SheetLink
                  link={{ href: "/cart", label: "Cart" }}
                  pathname={pathname}
                  trailing={
                    cartCount > 0 ? <span className="text-sm text-graphite tabular-nums">{cartCount}</span> : null
                  }
                />
              </ul>
            </nav>
          ) : null}

          <nav aria-label="Account" className="border-t border-rule pt-3">
            <ul className="flex flex-col">
              {accountLinks.map((link) => (
                <SheetLink key={link.href} link={link} pathname={pathname} />
              ))}
            </ul>
          </nav>

          <div className="border-t border-rule pt-4">
            {user ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                disabled={pending}
                onClick={() => void signOut()}
              >
                <LogOut aria-hidden />
                {pending ? "Signing out…" : "Sign out"}
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <SheetClose asChild>
                  <Button asChild size="lg" className="w-full">
                    <Link href="/sign-up">Create account</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild variant="secondary" size="lg" className="w-full">
                    <Link href="/sign-in">Sign in</Link>
                  </Button>
                </SheetClose>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
