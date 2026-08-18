import type { CourseLevel } from "@/generated/prisma/enums";
import { formatPrice } from "@/lib/format";

export const COURSE_LEVELS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
  { value: "ALL_LEVELS", label: "All levels" },
] as const satisfies ReadonlyArray<{ value: CourseLevel; label: string }>;

export function courseLevelLabel(level: string): string {
  return COURSE_LEVELS.find((entry) => entry.value === level)?.label ?? level;
}

export function coursePriceLabel(
  isFree: boolean,
  price: { amount: number; currency: string } | null,
): string {
  if (isFree) return "Free";
  if (price) return formatPrice(price.amount, price.currency);
  return "Not for sale";
}
