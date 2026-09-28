"use client";

import { useRef, useState, type DragEvent, type PointerEvent } from "react";
import { moveId } from "@/lib/course-editor";
import type { CurriculumState } from "../../../curriculum-actions";

/**
 * Mouse drag reorder for one list (the sections, or one section's items).
 * A row becomes draggable only while its grip is held, so inputs inside the
 * row keep normal text selection. The new order shows at once and is sent in
 * one call; a failure puts the old order back and returns the message.
 *
 * Each handler acts only while this list is dragging, so a nested list (items
 * inside a section) and its parent never both react to the same drag.
 */
export function useDragOrder<T extends { id: string }>(items: T[], commit: (ids: string[]) => Promise<CurriculumState>) {
  const base = items.map((item) => item.id).join(",");
  // The optimistic order belongs to the server order it was made from; once the
  // page refreshes (from this drop or a button move) the server's order wins.
  const [optimistic, setOptimistic] = useState<{ base: string; ids: string[] } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  // Read at drop time; state from the last render could be a dragover behind.
  const insertAtRef = useRef<number | null>(null);

  const byId = new Map(items.map((item) => [item.id, item]));
  const ids = optimistic?.base === base ? optimistic.ids : items.map((item) => item.id);
  const ordered = ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));

  function reset() {
    draggingRef.current = null;
    insertAtRef.current = null;
    setDragging(null);
    setInsertAt(null);
    setArmed(null);
  }

  async function drop() {
    const id = draggingRef.current;
    const at = insertAtRef.current;
    reset();
    if (!id || at === null) return;
    const next = moveId(ids, id, at);
    if (next.join(",") === ids.join(",")) return;
    setError(null);
    setOptimistic({ base, ids: next });
    const result = await commit(next);
    if (result.status === "error") {
      setOptimistic(null);
      setError(result.message);
    }
  }

  return {
    ordered,
    dragging,
    insertAt,
    error,
    /** Spread on the grip. */
    grip: (id: string) => ({
      onPointerDown: (event: PointerEvent) => {
        if (event.button === 0) setArmed(id);
      },
      onPointerUp: () => setArmed(null),
    }),
    /** Spread on each row, with its index in `ordered`. */
    row: (id: string, index: number) => ({
      draggable: armed === id,
      onDragStart: (event: DragEvent) => {
        if (armed !== id) return;
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
        draggingRef.current = id;
        setDragging(id);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!draggingRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        const box = event.currentTarget.getBoundingClientRect();
        const at = event.clientY < box.top + box.height / 2 ? index : index + 1;
        insertAtRef.current = at;
        setInsertAt(at);
      },
      onDrop: (event: DragEvent) => {
        if (!draggingRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        void drop();
      },
      onDragEnd: () => reset(),
    }),
  };
}
