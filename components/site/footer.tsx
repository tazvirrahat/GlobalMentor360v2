import Link from "next/link";
import { GraduationCap } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t bg-surface-alt">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-full bg-brand text-primary-foreground">
            <GraduationCap className="size-4" aria-hidden />
          </span>
          GlobalMentor<span className="text-brand">360</span>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/courses" className="hover:text-foreground">
            Courses
          </Link>
          <Link href="/sign-up" className="hover:text-foreground">
            Create account
          </Link>
          <Link href="/dashboard" className="hover:text-foreground">
            My learning
          </Link>
        </nav>

        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} GlobalMentor360
        </p>
      </div>
    </footer>
  );
}
