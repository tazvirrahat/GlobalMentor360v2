import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getUserRoles } from "@/lib/session";

/**
 * Session-aware site chrome. A server component on purpose: the nav depends on
 * roles, and roles must never be decided client-side.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();
  const roles = user ? await getUserRoles(user.id) : [];

  const isStaff = roles.includes("INSTRUCTOR") || roles.includes("ADMIN");
  const isAdmin = roles.includes("ADMIN");

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand text-primary-foreground">
            <GraduationCap className="size-4.5" aria-hidden />
          </span>
          <span className="text-lg">
            GlobalMentor<span className="text-brand">360</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm font-medium">
          <Link
            href="/courses"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Courses
          </Link>
          {isStaff ? (
            <Link
              href="/studio"
              className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Studio
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              href="/admin/payments"
              className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">My learning</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="shadow-brand">
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
