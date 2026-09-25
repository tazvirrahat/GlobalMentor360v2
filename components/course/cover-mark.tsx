import Image from "next/image";
import { coverInitial, coverTint } from "@/lib/cover";
import { cn } from "@/lib/utils";

const SIZES = {
  40: "size-10 text-xl",
  48: "size-12 text-2xl",
  64: "size-16 text-3xl",
} as const;

/**
 * A small square cover: the course's image when it has one (cropped to the
 * middle), otherwise its tint and the first letter of its title. Decorative:
 * the title beside it is the accessible name, so the image has empty alt.
 */
export function CoverMark({
  title,
  slug,
  imageUrl,
  size = 48,
  className,
}: {
  title: string;
  slug: string;
  /** From courseImageUrl; null or absent draws the letter tile. */
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const box = cn("flex shrink-0 overflow-hidden rounded-md border border-rule select-none", SIZES[size], className);
  if (imageUrl) {
    return (
      <span aria-hidden className={cn(box, "bg-wash")}>
        {/* unoptimized: the route redirects to a signed S3 URL, and drafts need the owner's cookie. */}
        <Image src={imageUrl} alt="" width={size} height={size} unoptimized className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(box, "items-center justify-center font-bold text-ink")}
      style={{ backgroundColor: coverTint(slug).bg }}
    >
      {coverInitial(title)}
    </span>
  );
}
