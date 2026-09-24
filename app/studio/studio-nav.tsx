"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/studio", label: "Courses" },
  { href: "/studio/qa", label: "Questions" },
  { href: "/studio/announcements", label: "Announcements" },
  { href: "/studio/coupons", label: "Coupons" },
] as const;

const LINK_BASE =
  "inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function isActive(href: string, pathname: string) {
  if (href === "/studio") {
    return pathname === "/studio" || pathname.startsWith("/studio/courses");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Nested studio routes share this layout. Next.js App Router Link clicks from
 * `/studio/announcements` (and the other children) to `/studio` do not change
 * the URL — the Courses item stays focused on the child page. Sibling hops
 * work. Pushing the index explicitly is what actually swaps the page slot.
 */
export function StudioNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav aria-label="Studio" className="border-b bg-wash">
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
              onClick={(event) => {
                if (link.href !== "/studio") return;
                if (pathname === "/studio") return;
                event.preventDefault();
                router.push("/studio");
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
