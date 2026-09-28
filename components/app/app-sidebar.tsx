"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BookOpen,
  ExternalLink,
  Film,
  Library,
  Megaphone,
  MessagesSquare,
  Star,
  Tags,
  TicketPercent,
  Undo2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AccountMenu } from "@/components/site/account-menu";
import { isActivePath, type NavLink } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };

const STUDIO: Item[] = [
  { href: "/studio", label: "Courses", icon: BookOpen },
  { href: "/studio/qa", label: "Questions", icon: MessagesSquare },
  { href: "/studio/reviews", label: "Reviews", icon: Star },
  { href: "/studio/announcements", label: "Announcements", icon: Megaphone },
  { href: "/studio/coupons", label: "Coupons", icon: TicketPercent },
  { href: "/studio/profile", label: "Your profile", icon: UserRound },
];

const ADMIN: Item[] = [
  { href: "/admin/payments", label: "Payments", icon: Banknote },
  { href: "/admin/refunds", label: "Refunds", icon: Undo2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/courses", label: "Courses", icon: Library },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/taxonomy", label: "Taxonomy", icon: Tags },
  { href: "/admin/videos", label: "Videos", icon: Film },
];

function active(href: string, pathname: string) {
  // Studio's Courses item also owns the course editor under /studio/courses.
  if (href === "/studio") return pathname === "/studio" || pathname.startsWith("/studio/courses");
  return isActivePath(href, pathname);
}

function Section({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: "Studio" | "Admin";
  items: Item[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const headingId = `app-nav-${label.toLowerCase()}`;
  return (
    <nav aria-labelledby={headingId} className="flex flex-col gap-1">
      {/* A label, not a heading: it names the nav landmark, and a second
          "Studio" heading beside the page's own h1 only adds noise. */}
      <p id={headingId} className="px-3 text-xs font-semibold text-graphite">
        {label}
      </p>
      <ul className="flex flex-col">
        {items.map((item) => {
          const current = active(item.href, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href as Route}
                aria-current={current ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm focus-ring-inset",
                  current
                    ? "bg-wash font-semibold text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-ink"
                    : "font-medium text-graphite hover:bg-wash hover:text-ink",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Studio and admin navigation. Sections by role: instructors see Studio, admins
 * see both. The active item is marked with an ink bar; the highlighter stays
 * reserved for the learner's position in a course.
 */
export function AppSidebar({
  siteName,
  roles,
  user,
  accountLinks,
  onNavigate,
}: {
  siteName: string;
  roles: readonly string[];
  user: { name: string; email: string };
  accountLinks: NavLink[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isAdmin = roles.includes("ADMIN");
  const isStaff = isAdmin || roles.includes("INSTRUCTOR");
  const area = pathname.startsWith("/admin") ? "Admin" : "Studio";

  return (
    <div className="flex h-full flex-col gap-6 px-3 py-4">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex min-h-11 flex-col justify-center rounded-md px-3 focus-ring"
      >
        <span className="text-base font-bold text-ink">{siteName}</span>
        <span className="text-xs text-graphite">{area}</span>
      </Link>

      {isStaff ? <Section label="Studio" items={STUDIO} pathname={pathname} onNavigate={onNavigate} /> : null}
      {isAdmin ? <Section label="Admin" items={ADMIN} pathname={pathname} onNavigate={onNavigate} /> : null}

      <div className="mt-auto flex flex-col gap-1 border-t border-rule pt-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-graphite hover:bg-wash hover:text-ink focus-ring-inset"
        >
          <ExternalLink className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          View site
        </Link>
        <AccountMenu
          name={user.name}
          email={user.email}
          links={accountLinks}
          side="top"
          align="start"
          showName
        />
      </div>
    </div>
  );
}
