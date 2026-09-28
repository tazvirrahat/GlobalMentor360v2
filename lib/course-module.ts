/**
 * How a course's lessons are shown wherever they appear: the player's rail,
 * the landing page's outline, and the "continue" card on home and dashboard.
 * Pure, so the rules are tested once and every view agrees.
 */
export type ModuleRow = {
  id: string;
  title: string;
  type: string;
  isPreview: boolean;
  durationSeconds: number | null;
  /** VIDEO or ARTICLE for lectures; picks the outline icon. */
  contentType?: string | null;
  /** Present only when a learner's progress is known. */
  completed?: boolean;
  locked?: boolean;
};

export type ModuleSection = { id: string; title: string; items: ModuleRow[] };

export type RowState = "current" | "done" | "open" | "locked";

export const isQuizType = (type: string) => type === "QUIZ" || type === "PRACTICE_TEST";

export function rowState(row: ModuleRow, currentId: string | null): RowState {
  if (row.id === currentId) return "current";
  if (row.locked) return "locked";
  if (row.completed) return "done";
  return "open";
}

/** An open quiz not yet passed, with locked lessons after it: passing it opens them. */
export function isGate(rows: readonly ModuleRow[], index: number): boolean {
  const row = rows[index];
  if (!row || !isQuizType(row.type) || row.completed || row.locked) return false;
  return rows.slice(index + 1).some((next) => next.locked);
}

/**
 * The few rows around the learner's position, for a compact card: the current
 * row's section, at most one done row before the current one, and the rows
 * after it up to `size`.
 */
export function compactWindow(
  sections: readonly ModuleSection[],
  currentId: string,
  size = 4,
): { section: ModuleSection; sectionIndex: number; rows: ModuleRow[] } | null {
  for (const [sectionIndex, section] of sections.entries()) {
    const index = section.items.findIndex((item) => item.id === currentId);
    if (index < 0) continue;
    const start = Math.max(0, index - 1);
    return { section, sectionIndex, rows: section.items.slice(start, start + size) };
  }
  return null;
}

export function sectionMinutes(section: ModuleSection): number {
  const seconds = section.items.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
  return Math.round(seconds / 60);
}
