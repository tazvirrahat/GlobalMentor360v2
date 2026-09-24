import type { Route } from "next";
import Link from "next/link";
import { footerLinks } from "@/lib/nav";
import { getCurrentUser } from "@/lib/session";
import { getSite } from "@/lib/site";

const LINK =
  "inline-flex min-h-6 items-center rounded-sm text-sm text-graphite underline-offset-4 hover:text-ink hover:underline focus-ring";

/**
 * Slim and state-aware: a signed-in learner is not offered "Sign in", the
 * footer does not repeat the home page's pitch, and Help is always here and in
 * the account menu (WCAG 3.2.6 consistent help).
 */
export async function SiteFooter() {
  const site = getSite();
  const user = await getCurrentUser();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <Link href="/" className="w-fit rounded-sm text-base font-bold text-ink focus-ring">
          {site.name}
        </Link>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {footerLinks({ signedIn: Boolean(user), roles: [] }).map((link) => (
              <li key={link.href}>
                <Link href={link.href as Route} className={LINK}>
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
