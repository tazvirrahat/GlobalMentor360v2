"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/**
 * Root client boundary for Motion. Keeps `app/layout.tsx` a server component
 * while honouring prefers-reduced-motion for every motion component.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
