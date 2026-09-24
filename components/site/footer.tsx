import Link from "next/link";
import type { Route } from "next";
import { getCurrentUser } from "@/lib/session";
import { getSite } from "@/lib/site";

const LINK =
  "inline-flex min-h-6 cursor-pointer items-center text-sm text-graphite underline-offset-4 hover:text-ink hover:underline focus-ring rounded-sm";

/**
 * Slim and state-aware: a signed-in learner is not offered "Sign in", and the
 * footer does not repeat the home page's pitch.
 */
export async function SiteFooter() {
  const site = getSite();
  const user = await getCurrentUser();
  const year = new Date().getFullYear();

  const links: { href: Route; label: string }[] = user
    ? [
        { href: "/courses", label: "Courses" },
        { href: "/dashboard", label: "My learning" },
        { href: "/orders", label: "Orders" },
        { href: "/account", label: "Account" },
      ]
    : [
        { href: "/courses", label: "Courses" },
        { href: "/sign-in", label: "Sign in" },
        { href: "/sign-up", label: "Create account" },
      ];

  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link href="/" className="w-fit rounded-sm font-heading text-base font-bold text-ink focus-ring">
          {site.name}
        </Link>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={LINK}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-sm text-graphite">
          © {year} {site.name}
        </p>
      </div>
    </footer>
  );
}
