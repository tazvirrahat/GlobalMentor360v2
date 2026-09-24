"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The only sanctioned entrance animation for product pages.
 *
 * Do not sprinkle `motion.div` in route files. Exceptions (player, quiz
 * feedback) are listed in design-system/MASTER.md.
 *
 * Transform-only 8px rise (opacity stays 1). Off-screen `whileInView` must
 * never leave content at opacity 0 — full-page capture, print, and a missed
 * intersection would otherwise show blank holes. Reduced motion skips motion
 * entirely via MotionConfig + useReducedMotion.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const rise: Variants = {
  hidden: { opacity: 1, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE_OUT },
  },
};

const stagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

const viewport = { once: true, amount: 0.2, margin: "0px 0px -8% 0px" } as const;

export function Reveal({
  children,
  className,
  lcpSafe = false,
}: {
  children: ReactNode;
  className?: string;
  /** Kept for call-site clarity; the primitive is already LCP-safe. */
  lcpSafe?: boolean;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      variants={rise}
      initial={lcpSafe ? false : "hidden"}
      whileInView="visible"
      viewport={viewport}
    >
      {children}
    </motion.div>
  );
}

/** Parent of `RevealItem`. Cap at ~6 children — see MASTER.md. */
export function RevealStagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      variants={stagger}
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div className={cn(className)} variants={rise}>
      {children}
    </motion.div>
  );
}
