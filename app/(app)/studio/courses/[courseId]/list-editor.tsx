"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listRowLabel } from "@/lib/course-editor";

type Row = { id: number; text: string };

/**
 * One list field of the landing page ("What you'll learn", …): numbered rows,
 * each labelled "Objective 1", "Objective 2"…, with Add and Remove. Every row
 * submits under the same `name`, which is what updateCourse reads; blank rows
 * are dropped on save.
 */
export function ListEditor({
  name,
  legend,
  hint,
  noun,
  addLabel,
  defaults,
  max = 20,
}: {
  name: string;
  legend: string;
  hint: string;
  noun: string;
  addLabel: string;
  defaults: string[];
  max?: number;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    (defaults.length > 0 ? defaults : [""]).map((text, index) => ({ id: index, text })),
  );
  const [nextId, setNextId] = useState(rows.length);
  const hintId = `${name}-hint`;

  function add() {
    setRows((current) => [...current, { id: nextId, text: "" }]);
    setNextId((id) => id + 1);
    // Focus the new row once it exists.
    requestAnimationFrame(() => document.getElementById(`${name}-${nextId}`)?.focus());
  }

  function remove(id: number, index: number) {
    setRows((current) => (current.length === 1 ? [{ id: nextId, text: "" }] : current.filter((row) => row.id !== id)));
    if (rows.length === 1) setNextId((value) => value + 1);
    // Keep focus in the list: the row that takes this one's place, or Add.
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
      (inputs[Math.min(index, inputs.length - 1)] ?? document.getElementById(`${name}-add`))?.focus();
    });
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={hintId}>
      <legend className="text-base font-semibold text-ink">{legend}</legend>
      <p id={hintId} className="-mt-1 text-sm text-graphite">
        {hint}
      </p>
      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const label = listRowLabel(noun, index);
          return (
            <li key={row.id} className="flex items-center gap-2">
              <span aria-hidden className="w-6 shrink-0 text-right text-sm text-graphite tabular-nums">
                {index + 1}
              </span>
              <Input
                id={`${name}-${row.id}`}
                name={name}
                aria-label={label}
                value={row.text}
                onChange={(event) => {
                  const text = event.target.value;
                  setRows((current) => current.map((item) => (item.id === row.id ? { ...item, text } : item)));
                }}
                maxLength={300}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${label.toLowerCase()}`}
                onClick={() => remove(row.id, index)}
              >
                <X aria-hidden />
              </Button>
            </li>
          );
        })}
      </ol>
      <Button
        id={`${name}-add`}
        type="button"
        variant="secondary"
        size="sm"
        className="ml-8 w-fit"
        onClick={add}
        disabled={rows.length >= max}
      >
        <Plus aria-hidden /> {addLabel}
      </Button>
    </fieldset>
  );
}
