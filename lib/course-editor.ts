/**
 * The course editor's tabs (spec §6 Studio). Details, Landing page and Pricing
 * share one form and one Save; Publish has its own action. Curriculum and
 * Analytics are separate routes shown in the same nav.
 */

export const COURSE_EDITOR_TABS = ["details", "landing", "pricing", "publish"] as const;
export type CourseEditorTab = (typeof COURSE_EDITOR_TABS)[number];

export const COURSE_EDITOR_LABELS: Record<CourseEditorTab | "curriculum" | "analytics", string> = {
  details: "Details",
  landing: "Landing page",
  pricing: "Pricing",
  curriculum: "Curriculum",
  publish: "Publish",
  analytics: "Analytics",
};

/** `?tab=` to a tab; anything unknown opens Details. */
export function pickEditorTab(raw: string | string[] | undefined): CourseEditorTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (COURSE_EDITOR_TABS as readonly string[]).includes(value ?? "") ? (value as CourseEditorTab) : "details";
}

/** The accessible name of one row in a list field: ("Objective", 0) → "Objective 1". */
export function listRowLabel(noun: string, index: number): string {
  return `${noun} ${index + 1}`;
}
