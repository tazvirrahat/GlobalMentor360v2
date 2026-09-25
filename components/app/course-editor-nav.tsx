"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { COURSE_EDITOR_LABELS, type CourseEditorTab } from "@/lib/course-editor";
import { cn } from "@/lib/utils";

const ORDER = ["details", "landing", "pricing", "curriculum", "publish"] as const;
type Key = (typeof ORDER)[number];

function hrefFor(courseId: string, key: Key): Route {
  if (key === "curriculum") return `/studio/courses/${courseId}/curriculum` as Route;
  if (key === "details") return `/studio/courses/${courseId}` as Route;
  return `/studio/courses/${courseId}?tab=${key}` as Route;
}

/**
 * The course editor's sections as links, so each one has a URL and works
 * without script. On the settings page `onSelect` switches the in-page tabs
 * without a navigation (unsaved edits in the other tabs stay put); Curriculum
 * is always a real navigation to its own page.
 */
export function CourseEditorNav({
  courseId,
  current,
  onSelect,
}: {
  courseId: string;
  current: Key;
  onSelect?: (tab: CourseEditorTab) => void;
}) {
  // On a phone the nav scrolls sideways; keep the current section in view.
  // Scrolls the nav itself: scrollIntoView would also move the browser's
  // sequential-focus starting point, so the first Tab skipped the skip link.
  const nav = useRef<HTMLElement>(null);
  const activeLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const container = nav.current;
    const link = activeLink.current;
    if (!container || !link) return;
    const start = link.offsetLeft - container.offsetLeft;
    const end = start + link.offsetWidth;
    if (start < container.scrollLeft) container.scrollLeft = start;
    else if (end > container.scrollLeft + container.clientWidth) container.scrollLeft = end - container.clientWidth;
  }, [current]);

  function handle(event: MouseEvent<HTMLAnchorElement>, key: Key) {
    if (!onSelect || key === "curriculum") return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onSelect(key);
  }

  return (
    <nav ref={nav} aria-label="Course editor" className="-mx-4 overflow-x-auto border-b border-rule px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {ORDER.map((key) => {
          const active = key === current;
          return (
            <li key={key}>
              <Link
                href={hrefFor(courseId, key)}
                ref={active ? activeLink : undefined}
                aria-current={active ? "page" : undefined}
                onClick={(event) => handle(event, key)}
                scroll={false}
                className={cn(
                  "relative inline-flex min-h-11 items-center rounded-t-md px-3 text-sm font-semibold focus-ring-inset",
                  active
                    ? "text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-ink"
                    : "text-graphite hover:text-ink",
                )}
              >
                {COURSE_EDITOR_LABELS[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
