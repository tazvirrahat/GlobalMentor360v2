"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/reviews", label: "Reviews" },
] as const;

const LINK_BASE =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function isActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="border-b bg-wash">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 py-2 sm:px-6 lg:px-8">
        {LINKS.map((link) => {
          const active = isActive(link.href, pathname);
          return (
            <Link
              key={link.href}
              href={link.href as Route}
              aria-current={active ? "page" : undefined}
              className={cn(
                LINK_BASE,
                active
                  ? "bg-muted font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
