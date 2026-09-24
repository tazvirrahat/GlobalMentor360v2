import Link from "next/link";
import { GraduationCap } from "lucide-react";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-wash">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8 lg:py-16">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center gap-2 font-heading text-lg font-semibold tracking-tight"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="size-4" aria-hidden />
            </span>
            GlobalMentor<span className="text-primary">360</span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            A structured online academy for Bangladesh: video lessons, quiz-gated
            progress, and verifiable certificates. Pay with bKash in BDT.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-sm font-semibold tracking-tight">Learn</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <li>
              <Link href="/courses" className="cursor-pointer hover:text-foreground hover:underline hover:underline-offset-4">
                Courses
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="cursor-pointer hover:text-foreground hover:underline hover:underline-offset-4">
                My learning
              </Link>
            </li>
            <li>
              <Link href="/cart" className="cursor-pointer hover:text-foreground hover:underline hover:underline-offset-4">
                Cart
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-sm font-semibold tracking-tight">Account</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <li>
              <Link href="/sign-in" className="cursor-pointer hover:text-foreground hover:underline hover:underline-offset-4">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/sign-up" className="cursor-pointer hover:text-foreground hover:underline hover:underline-offset-4">
                Create account
              </Link>
            </li>
            <li>
              <Link href="/account" className="cursor-pointer hover:text-foreground hover:underline hover:underline-offset-4">
                Account
              </Link>
            </li>
            <li>
              <Link href="/orders" className="cursor-pointer hover:text-foreground hover:underline hover:underline-offset-4">
                Orders
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-sm font-semibold tracking-tight">Academy</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Finish a course and earn a certificate with a public verification link.
            Checkout is priced in BDT for bKash.
          </p>
          <p className="mt-6 text-sm text-muted-foreground">© {year} GlobalMentor360</p>
        </div>
      </div>
    </footer>
  );
}
