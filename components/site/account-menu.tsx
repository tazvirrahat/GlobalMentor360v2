"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import { initials, type NavLink } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** The ink initials circle. Decorative: the trigger carries the name. */
export function InitialsAvatar({ name, email, className }: { name: string; email: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white",
        className,
      )}
    >
      {initials(name, email)}
    </span>
  );
}

/** Signs out, then lands on the home page with fresh server chrome. */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    try {
      await signOut();
    } finally {
      router.push("/");
      router.refresh();
    }
  }
  return { pending, signOut: run };
}

/**
 * The one account menu: Account, Orders, Studio and Admin by role, Help, Sign
 * out. The site top bar and the app sidebar both use it, so these links exist
 * in exactly one place.
 */
export function AccountMenu({
  name,
  email,
  links,
  side = "bottom",
  align = "end",
  showName = false,
}: {
  name: string;
  email: string;
  links: NavLink[];
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** Show the name beside the avatar (the app sidebar has room for it). */
  showName?: boolean;
}) {
  const { pending, signOut } = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name || email}`}
        className={cn(
          "inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-ink hover:bg-wash focus-ring data-[state=open]:bg-wash",
          showName && "w-full justify-start px-2",
        )}
      >
        <InitialsAvatar name={name} email={email} />
        {showName ? <span className="min-w-0 truncate text-sm font-medium">{name || email}</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={6} className="w-64 p-1.5">
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-2.5 py-2">
          <span className="truncate text-sm font-semibold text-ink">{name || email}</span>
          <span className="text-xs font-normal break-all text-graphite">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {links.map((link) => (
          <DropdownMenuItem key={link.href} asChild className="min-h-10 cursor-pointer px-2.5 text-ink">
            <Link href={link.href as Route}>{link.label}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-10 cursor-pointer px-2.5 text-ink"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <LogOut aria-hidden />
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
