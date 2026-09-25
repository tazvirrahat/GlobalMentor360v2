"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TAXONOMY_NAME_MAX } from "@/lib/taxonomy-rules";
import { addCategoryAction, addTagAction, taxonomyRowAction, type TaxonomyState } from "./actions";

const idle: TaxonomyState = { status: "idle" };

function Hidden({ kind, id, intent }: { kind: string; id: string; intent: string }) {
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}

/**
 * One category, topic or skill: its name and course count, then Rename (edits
 * in place), Move up / down for categories, and Delete (asks first). All of a
 * row's forms share one action state, so its message shows under the row.
 */
export function TaxonomyRow({
  kind,
  id,
  name,
  meta,
  deleteQuestion,
  move,
  nested = false,
}: {
  kind: "category" | "topic" | "skill";
  id: string;
  name: string;
  meta: string;
  deleteQuestion: string;
  move?: { up: boolean; down: boolean };
  nested?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const renameButton = useRef<HTMLButtonElement | null>(null);
  const refocus = useRef(false);
  const [state, action, pending] = useActionState(async (prev: TaxonomyState, formData: FormData) => {
    const result = await taxonomyRowAction(prev, formData);
    if (result.status === "done" && formData.get("intent") === "rename") {
      refocus.current = true;
      setEditing(false);
    }
    return result;
  }, idle);
  const inputId = `rename-${id}`;

  return (
    <div className={nested ? "flex flex-col gap-1.5 py-2 pl-6" : "flex flex-col gap-1.5 py-2.5"}>
      {editing ? (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <Hidden kind={kind} id={id} intent="rename" />
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <Label htmlFor={inputId}>New name for {name}</Label>
            <Input id={inputId} name="name" defaultValue={name} required minLength={2} maxLength={TAXONOMY_NAME_MAX} autoFocus />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              refocus.current = true;
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* A minimum width: on a phone the buttons wrap under a long name instead of breaking it mid-word. */}
          <span className="flex min-w-40 flex-1 flex-col">
            <span className={nested ? "font-medium break-words text-ink" : "font-semibold break-words text-ink"}>{name}</span>
            <span className="text-sm text-graphite">{meta}</span>
          </span>
          <span className="flex items-center gap-1">
            <Button
              ref={(node) => {
                renameButton.current = node;
                if (node && refocus.current) {
                  refocus.current = false;
                  node.focus();
                }
              }}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Rename ${name}`}
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden />
            </Button>
            {move ? (
              <>
                <form action={action}>
                  <Hidden kind={kind} id={id} intent="up" />
                  <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Move ${name} up`} disabled={!move.up || pending}>
                    <ArrowUp aria-hidden />
                  </Button>
                </form>
                <form action={action}>
                  <Hidden kind={kind} id={id} intent="down" />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${name} down`}
                    disabled={!move.down || pending}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                </form>
              </>
            ) : null}
            <form action={action}>
              <Hidden kind={kind} id={id} intent="delete" />
              <ConfirmSubmit label={`Delete ${name}`} question={deleteQuestion} confirmLabel="Delete" icon={<Trash2 aria-hidden />} />
            </form>
          </span>
        </div>
      )}
      {state.status === "error" ? <FieldError message={state.message} /> : null}
    </div>
  );
}

function AddResult({ state }: { state: TaxonomyState }) {
  if (state.status === "error") return <FieldError message={state.message} />;
  if (state.status === "done") {
    return (
      <p role="status" className="text-sm font-medium text-ink">
        {state.message}
      </p>
    );
  }
  return null;
}

/** Adds a subject, or a subcategory under one. */
export function AddCategoryForm({ subjects }: { subjects: { id: string; name: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [parent, setParent] = useState("none");
  const [state, action, pending] = useActionState(async (prev: TaxonomyState, formData: FormData) => {
    const result = await addCategoryAction(prev, formData);
    if (result.status === "done") form.current?.reset();
    return result;
  }, idle);

  return (
    <form ref={form} action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-category">New category</Label>
          <Input id="new-category" name="name" required minLength={2} maxLength={TAXONOMY_NAME_MAX} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-category-parent">Under</Label>
          <input type="hidden" name="parentId" value={parent} />
          <Select value={parent} onValueChange={setParent}>
            <SelectTrigger id="new-category-parent" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nothing: a new subject</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add category"}
        </Button>
        <AddResult state={state} />
      </div>
    </form>
  );
}

export function AddTagForm({ kind }: { kind: "topic" | "skill" }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: TaxonomyState, formData: FormData) => {
    const result = await addTagAction(prev, formData);
    if (result.status === "done") form.current?.reset();
    return result;
  }, idle);
  const noun = kind === "topic" ? "topic" : "skill";
  const inputId = `new-${kind}`;

  return (
    <form ref={form} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor={inputId}>New {noun}</Label>
          <Input id={inputId} name="name" required minLength={2} maxLength={TAXONOMY_NAME_MAX} />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : `Add ${noun}`}
        </Button>
      </div>
      <AddResult state={state} />
    </form>
  );
}
