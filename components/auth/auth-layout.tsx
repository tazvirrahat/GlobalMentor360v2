import type { ReactNode } from "react";

/**
 * Sign-in, sign-up and password reset: one calm column, no art. The form sits
 * on a surface panel; `footer` is the "New here? Create an account" line.
 */
export function AuthLayout({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[25rem] flex-col gap-6 px-4 py-12 sm:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{title}</h1>
        {lede ? <p className="text-graphite">{lede}</p> : null}
      </div>
      <div className="rounded-lg border border-rule bg-surface p-5 sm:p-6">{children}</div>
      {footer ? <p className="text-sm text-graphite">{footer}</p> : null}
    </main>
  );
}

export const AUTH_LINK =
  "inline-flex min-h-6 items-center rounded-sm font-semibold text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring";
