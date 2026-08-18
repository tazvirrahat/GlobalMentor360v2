"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/studio", label: "Courses" },
  { href: "/studio/qa", label: "Questions" },
  { href: "/studio/announcements", label: "Announcements" },
  { href: "/studio/coupons", label: "Coupons" },
] as const;

const LINK_CLASS =
  "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground";

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
    <nav aria-label="Studio" className="border-b bg-surface-alt">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-1 px-4 py-3 sm:px-6">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href as Route}
            className={LINK_CLASS}
            onClick={(event) => {
              if (link.href !== "/studio") return;
              if (pathname === "/studio") return;
              event.preventDefault();
              router.push("/studio");
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
