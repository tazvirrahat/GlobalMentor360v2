import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The top of every studio and admin page (spec §5 app shell): an optional back
 * link, the page's h1 with its status beside it, one line of description, and
 * the page's actions on the right — one primary at most.
 */
export function PageHeader({
  title,
  description,
  back,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: Route; label: string };
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-1 inline-flex min-h-8 w-fit items-center gap-1 rounded-sm px-1 text-sm font-medium text-graphite hover:text-ink focus-ring"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 text-2xl font-semibold text-balance sm:text-3xl">{title}</h1>
            {meta}
          </div>
          {description ? <p className="max-w-[65ch] text-graphite">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
