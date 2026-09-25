import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A titled block on a studio or admin page: a real heading (the old Card title
 * was a div, so screen reader users could not jump between these), an optional
 * line of description, actions on the right.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  headingLevel = 2,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const id = useId();
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section
      aria-labelledby={id}
      className={cn("flex flex-col gap-5 rounded-lg border border-rule bg-surface p-5 sm:p-6", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading id={id} className="text-lg font-semibold text-ink">
            {title}
          </Heading>
          {description ? <p className="text-sm text-graphite">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
