import type { Route } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { formatDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The red seal: the only red disc in the product, and only ever on a
 * certificate. Decorative; the certificate says in words that it is verified.
 */
export function Seal({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
    >
      <circle cx="32" cy="32" r="31" className="fill-seal" />
      <circle cx="32" cy="32" r="25" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="2 3" />
      <path d="M21 33.5 28.5 41 44 24" fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type HeadingLevel = 1 | 2 | 3 | "p";

function CourseHeading({ level, className, children }: { level: HeadingLevel; className: string; children: string }) {
  if (level === 1) return <h1 className={className}>{children}</h1>;
  if (level === 2) return <h2 className={className}>{children}</h2>;
  if (level === 3) return <h3 className={className}>{children}</h3>;
  return <p className={className}>{children}</p>;
}

/**
 * The certificate: the one special object (spec §4). The only thing with a hard
 * edge and a solid offset shadow, the only place bottle green is a surface, the
 * only place the red seal appears. `full` on its own page, `card` as a sample
 * on the home page and at the moment a course is completed.
 */
export function Certificate({
  size,
  siteName,
  recipient,
  course,
  issuedAt,
  serial,
  courseHeadingLevel = "p",
  className,
}: {
  size: "full" | "card";
  siteName: string;
  recipient: string;
  course: string;
  issuedAt: Date;
  serial: string;
  courseHeadingLevel?: HeadingLevel;
  className?: string;
}) {
  const full = size === "full";

  return (
    <figure
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-[2px] border border-verified bg-surface text-ink [print-color-adjust:exact]",
        full ? "shadow-certificate" : "shadow-certificate-sm",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-verified text-white",
          full ? "px-6 py-3 sm:px-10" : "px-5 py-2.5",
        )}
      >
        <span className={cn("font-bold tracking-tight", full ? "text-base" : "text-sm")}>{siteName}</span>
        <span className={full ? "text-sm" : "text-xs"}>Certificate of completion</span>
      </div>

      <div className={cn("flex flex-col", full ? "gap-2 px-6 py-8 sm:px-10 sm:py-12" : "gap-1.5 px-5 py-6")}>
        <p className={cn("text-graphite", full ? "text-sm" : "text-xs")}>This certifies that</p>
        <p className={cn("font-bold tracking-tight break-words", full ? "text-3xl sm:text-4xl" : "text-2xl")}>
          {recipient}
        </p>
        <p className={cn("text-graphite", full ? "mt-4 text-sm" : "mt-2 text-xs")}>completed the online course</p>
        <CourseHeading
          level={courseHeadingLevel}
          className={cn("font-semibold tracking-tight break-words", full ? "text-2xl sm:text-3xl" : "text-lg")}
        >
          {course}
        </CourseHeading>

        <div
          className={cn(
            "flex items-end justify-between gap-4 border-t border-rule",
            full ? "mt-8 pt-6" : "mt-5 pt-4",
          )}
        >
          <dl className={cn("grid gap-3", full ? "sm:grid-cols-[auto_auto] sm:gap-x-10" : "")}>
            <div className="flex flex-col">
              <dt className="text-xs text-graphite">Issued</dt>
              <dd className={full ? "text-base" : "text-sm"}>
                <time dateTime={issuedAt.toISOString()}>{formatDateLong(issuedAt)}</time>
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-xs text-graphite">Certificate number</dt>
              <dd className={cn("font-mono font-medium [overflow-wrap:anywhere]", full ? "text-base" : "text-sm")}>{serial}</dd>
            </div>
          </dl>
          <Seal size={full ? 64 : 44} />
        </div>
      </div>
    </figure>
  );
}

/**
 * A small link to a learner's certificate, for lists (My learning, completed
 * courses). The accessible name starts with "View certificate".
 */
export function CertificateChip({ serial, className }: { serial: string; className?: string }) {
  return (
    <Link
      href={`/certificates/${serial}` as Route}
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-[2px] border border-verified bg-surface px-2.5 text-sm font-medium text-ink hover:bg-wash focus-ring",
        className,
      )}
    >
      <Award className="size-4 shrink-0 text-verified" strokeWidth={1.75} aria-hidden />
      View certificate
      <span className="hidden font-mono text-xs font-medium text-graphite sm:inline">{serial}</span>
    </Link>
  );
}
