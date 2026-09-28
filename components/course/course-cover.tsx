import Image from "next/image";
import { BarChart3, BookOpen, Briefcase, Code2, MessagesSquare, Palette, Smartphone, Table2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A 16:9 course thumbnail. Uses the course's own image when it has one;
 * otherwise draws a generated cover in one of six deep colours (none of them
 * the colours that mean something: verified green, seal red, highlighter),
 * with the subject's icon as a large motif and the title set on it, so a
 * catalog without uploaded thumbnails still looks like a real storefront.
 * Decorative: the card's title is the accessible name.
 */
const COVERS = ["#27336e", "#4b2f78", "#17516b", "#7a3f24", "#44501b", "#34394d"] as const;

const ICONS: Record<string, LucideIcon> = {
  "web-development": Code2,
  "data-science": BarChart3,
  "mobile-development": Smartphone,
  "office-productivity": Table2,
  "career-skills": MessagesSquare,
  management: Briefcase,
  entrepreneurship: Briefcase,
  "web-design": Palette,
  "ux-design": Palette,
};

function hash(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function CourseCover({
  title,
  slug,
  categorySlug,
  categoryName,
  imageUrl,
  className,
  priority = false,
}: {
  title: string;
  slug: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  imageUrl?: string | null;
  className?: string;
  priority?: boolean;
}) {
  const box = cn("relative aspect-video w-full overflow-hidden rounded-md", className);
  if (imageUrl) {
    return (
      <span aria-hidden className={cn(box, "block bg-wash")}>
        <Image src={imageUrl} alt="" fill unoptimized priority={priority} className="object-cover" />
      </span>
    );
  }
  const Icon = (categorySlug && ICONS[categorySlug]) || BookOpen;
  const bg = COVERS[hash(slug) % COVERS.length];
  return (
    <span aria-hidden className={cn(box, "flex flex-col justify-end p-4 text-white select-none")} style={{ backgroundColor: bg }}>
      <Icon className="absolute -top-4 -right-4 size-36 text-white/12" strokeWidth={1.25} />
      <span className="absolute top-4 left-4 size-8 rounded-full border border-white/25" />
      <span className="absolute top-6 left-10 h-px w-16 bg-white/25" />
      {categoryName ? (
        <span className="relative mb-1 text-xs font-medium text-white/80">{categoryName}</span>
      ) : null}
      <span className="relative line-clamp-2 text-lg leading-tight font-bold">{title}</span>
    </span>
  );
}
