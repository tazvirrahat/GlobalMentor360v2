import { coverInitial, coverTint } from "@/lib/cover";
import { cn } from "@/lib/utils";

const SIZES = {
  40: "size-10 text-xl",
  48: "size-12 text-2xl",
  64: "size-16 text-3xl",
} as const;

/**
 * A small generated cover: the course's tint and the first letter of its
 * title. Decorative: the title beside it is the accessible name.
 */
export function CoverMark({
  title,
  slug,
  size = 48,
  className,
}: {
  title: string;
  slug: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border border-rule font-bold text-ink select-none",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: coverTint(slug).bg }}
    >
      {coverInitial(title)}
    </span>
  );
}
