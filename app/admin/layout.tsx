import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/reviews", label: "Reviews" },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole("ADMIN");

  return (
    <div>
      <nav
        aria-label="Admin"
        className="border-b bg-surface-alt"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap gap-1 px-4 py-3 sm:px-6">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href as Route}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}
