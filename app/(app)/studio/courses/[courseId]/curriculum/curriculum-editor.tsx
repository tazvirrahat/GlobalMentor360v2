"use client";

import { useActionState, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, GripVertical, ListChecks, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addItem,
  addSection,
  deleteItem,
  deleteSection,
  moveItem,
  moveSection,
  renameSection,
  reorderItems,
  reorderSections,
  togglePreview,
  type CurriculumState,
} from "../../../curriculum-actions";
import { useDragOrder } from "./use-drag-order";
import { LectureVideoPanel, type LectureVideoInfo } from "./video-upload";

const initial: CurriculumState = { status: "idle" };

type Item = {
  id: string;
  title: string;
  type: string;
  position: number;
  isPreview: boolean;
  lecture: LectureVideoInfo | null;
  /** Present on QUIZ items. The count drives the empty-quiz warning below. */
  assessment: { id: string; _count: { questions: number } } | null;
};

type Section = {
  id: string;
  title: string;
  position: number;
  items: Item[];
};

export function AddSectionForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(addSection, initial);

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="courseId" value={courseId} />
      <Label htmlFor="new-section">New section title</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="new-section"
          name="title"
          required
          maxLength={200}
          className="min-w-0 flex-1 basis-full sm:max-w-md sm:basis-auto"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add section"}
        </Button>
      </div>
      {state.status === "error" ? <FieldError message={state.message} /> : null}
    </form>
  );
}

function AddItemForm({ sectionId }: { sectionId: string }) {
  const [state, action, pending] = useActionState(addItem, initial);

  return (
    <form action={action} className="flex flex-col gap-1.5 rounded-b-lg border-t border-rule bg-wash/40 px-4 py-3">
      <input type="hidden" name="sectionId" value={sectionId} />
      <Label htmlFor={`item-${sectionId}`}>New item title</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`item-${sectionId}`}
          name="title"
          required
          maxLength={200}
          className="min-w-0 flex-1 basis-full sm:max-w-md sm:basis-auto"
        />
        {/*
          Two submit buttons rather than a type dropdown: `type` is the only field
          that differs, and a select the author must set before submitting is one
          more way to create the wrong thing. formData takes the clicked button's
          value, which is what addItem reads.
        */}
        <Button type="submit" name="type" value="LECTURE" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add lecture"}
        </Button>
        <Button type="submit" name="type" value="QUIZ" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add quiz"}
        </Button>
      </div>
      {state.status === "error" ? <FieldError message={state.message} /> : null}
    </form>
  );
}

/** Up and down as two small forms: works without script, and each button says what it moves. */
function MoveButtons({
  action,
  idName,
  id,
  title,
  isFirst,
  isLast,
}: {
  action: (formData: FormData) => void;
  idName: "itemId" | "sectionId";
  id: string;
  title: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <>
      <form action={action}>
        <input type="hidden" name={idName} value={id} />
        <input type="hidden" name="direction" value="up" />
        <Button type="submit" variant="ghost" size="icon-sm" disabled={isFirst} aria-label={`Move ${title} up`}>
          <ArrowUp aria-hidden />
        </Button>
      </form>
      <form action={action}>
        <input type="hidden" name={idName} value={id} />
        <input type="hidden" name="direction" value="down" />
        <Button type="submit" variant="ghost" size="icon-sm" disabled={isLast} aria-label={`Move ${title} down`}>
          <ArrowDown aria-hidden />
        </Button>
      </form>
    </>
  );
}

type DragProps = {
  row: ReturnType<ReturnType<typeof useDragOrder>["row"]>;
  grip: ReturnType<ReturnType<typeof useDragOrder>["grip"]>;
  lineBefore: boolean;
  lineAfter: boolean;
  dragging: boolean;
};

/**
 * The mouse grip. Decorative on purpose: the Up/Down buttons are the keyboard,
 * touch and single-pointer way to reorder (WCAG 2.5.7), so the grip is hidden
 * from assistive tech and on screens without a fine pointer, where HTML5 drag
 * does not work anyway.
 */
function Grip({ grip }: { grip: DragProps["grip"] }) {
  return (
    <span
      {...grip}
      aria-hidden
      title="Drag to reorder"
      className="-ml-1 hidden size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-graphite hover:bg-wash active:cursor-grabbing pointer-fine:flex"
    >
      <GripVertical className="size-4" />
    </span>
  );
}

/** Where a dragged row will land: a line above or below this one. */
function DropLine({ drag, offset = "-top-px" }: { drag: DragProps; offset?: string }) {
  return (
    <>
      {drag.lineBefore ? <span aria-hidden className={`pointer-events-none absolute inset-x-0 ${offset} z-10 h-0.5 bg-ink`} /> : null}
      {drag.lineAfter ? <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px z-10 h-0.5 bg-ink" /> : null}
    </>
  );
}

function ItemRow({
  courseId,
  item,
  isFirst,
  isLast,
  drag,
}: {
  courseId: string;
  item: Item;
  isFirst: boolean;
  isLast: boolean;
  drag: DragProps;
}) {
  const [, move] = useActionState(moveItem, initial);
  const [, toggle, toggling] = useActionState(togglePreview, initial);
  const [, remove] = useActionState(deleteItem, initial);
  const quiz = item.type === "QUIZ";
  const emptyQuiz = quiz && item.assessment?._count.questions === 0;

  return (
    <li {...drag.row} className={`relative flex flex-col gap-2 px-4 py-3 ${drag.dragging ? "opacity-50" : ""}`}>
      <DropLine drag={drag} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2.5 sm:basis-auto">
          <Grip grip={drag.grip} />
          {quiz ? (
            <ListChecks className="size-4 shrink-0 text-graphite" aria-hidden />
          ) : (
            <FileText className="size-4 shrink-0 text-graphite" aria-hidden />
          )}
          {/*
            The title is the way into the item editor. Without a link here the
            editor route is reachable only by typing a URL, which is how the quiz
            builder and the article editor both shipped orphaned the first time.
          */}
          <Link
            href={`/studio/courses/${courseId}/curriculum/${item.id}` as Route}
            className="inline-flex min-h-8 min-w-0 items-center rounded-sm font-medium text-ink hover:underline focus-ring"
          >
            <span className="sm:truncate">{item.title}</span>
          </Link>
          <span className="shrink-0 text-sm text-graphite">{quiz ? "Quiz" : "Lecture"}</span>
          {item.isPreview ? <Badge variant="outline">Free preview</Badge> : null}
        </div>

        <div className="-ml-2 flex items-center pl-6.5 sm:ml-0 sm:pl-0">
          <MoveButtons action={move} idName="itemId" id={item.id} title={item.title} isFirst={isFirst} isLast={isLast} />
          <form action={toggle}>
            <input type="hidden" name="itemId" value={item.id} />
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              disabled={toggling}
              aria-label={item.isPreview ? `Stop offering ${item.title} as a free preview` : `Offer ${item.title} as a free preview`}
              aria-pressed={item.isPreview}
            >
              {item.isPreview ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            </Button>
          </form>
          <form action={remove}>
            <input type="hidden" name="itemId" value={item.id} />
            <ConfirmSubmit
              label={`Delete ${item.title}`}
              question={`Delete “${item.title}”?`}
              confirmLabel="Delete"
              icon={<Trash2 aria-hidden />}
            />
          </form>
        </div>
      </div>

      {emptyQuiz ? (
        <p role="status" className="flex items-center gap-1.5 pl-6.5 text-sm font-medium text-seal pointer-fine:pl-16">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          No questions yet. An empty quiz lets every learner pass, so add questions before publishing.
        </p>
      ) : null}
      {item.type === "LECTURE" ? (
        <div className="pl-6.5 pointer-fine:pl-16">
          <LectureVideoPanel itemId={item.id} lecture={item.lecture} />
        </div>
      ) : null}
    </li>
  );
}

function SectionTitle({ section, index }: { section: Section; index: number }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: CurriculumState, formData: FormData) => {
    const result = await renameSection(prev, formData);
    if (result.status === "done") setEditing(false);
    return result;
  }, initial);

  if (editing) {
    return (
      <form action={action} className="flex min-w-0 flex-1 flex-col gap-1.5">
        <input type="hidden" name="sectionId" value={section.id} />
        <Label htmlFor={`rename-${section.id}`}>Section {index + 1} title</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`rename-${section.id}`}
            name="title"
            defaultValue={section.title}
            required
            maxLength={200}
            autoFocus
            className="min-w-0 flex-1 sm:max-w-md"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        {state.status === "error" ? <FieldError message={state.message} /> : null}
      </form>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-graphite">Section {index + 1}</span>
        <h3 className="text-lg font-semibold text-ink">{section.title}</h3>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Rename ${section.title}`}
        onClick={() => setEditing(true)}
        className="self-end"
      >
        <Pencil aria-hidden />
      </Button>
    </div>
  );
}

function SectionBlock({
  courseId,
  section,
  index,
  count,
  drag,
}: {
  courseId: string;
  section: Section;
  index: number;
  count: number;
  drag: DragProps;
}) {
  const [, move] = useActionState(moveSection, initial);
  const [, remove] = useActionState(deleteSection, initial);
  const items = useDragOrder(section.items, (ids) => reorderItems({ sectionId: section.id, ids }));

  return (
    <li {...drag.row} className={`relative rounded-lg border border-rule bg-surface ${drag.dragging ? "opacity-50" : ""}`}>
      <DropLine drag={drag} offset="-top-2.5" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border-b border-rule px-4 py-3">
        <Grip grip={drag.grip} />
        <SectionTitle section={section} index={index} />
        <div className="flex items-center">
          <MoveButtons
            action={move}
            idName="sectionId"
            id={section.id}
            title={section.title}
            isFirst={index === 0}
            isLast={index === count - 1}
          />
          <form action={remove}>
            <input type="hidden" name="sectionId" value={section.id} />
            <ConfirmSubmit
              label={`Delete section ${section.title}`}
              question={
                section.items.length === 0
                  ? "Delete this section?"
                  : `Delete this section and its ${section.items.length} ${section.items.length === 1 ? "item" : "items"}?`
              }
              confirmLabel="Delete section"
              icon={<Trash2 aria-hidden />}
            />
          </form>
        </div>
      </div>

      {section.items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-graphite">Nothing in this section yet. Add a lecture or a quiz below.</p>
      ) : (
        <ol className="divide-y divide-rule">
          {items.ordered.map((item, itemIndex) => (
            <ItemRow
              key={item.id}
              courseId={courseId}
              item={item}
              isFirst={itemIndex === 0}
              isLast={itemIndex === items.ordered.length - 1}
              drag={{
                row: items.row(item.id, itemIndex),
                grip: items.grip(item.id),
                lineBefore: items.insertAt === itemIndex,
                lineAfter: items.insertAt === items.ordered.length && itemIndex === items.ordered.length - 1,
                dragging: items.dragging === item.id,
              }}
            />
          ))}
        </ol>
      )}
      {items.error ? (
        <div className="px-4 pb-3">
          <FieldError message={items.error} />
        </div>
      ) : null}

      <AddItemForm sectionId={section.id} />
    </li>
  );
}

export function SectionList({ courseId, sections }: { courseId: string; sections: Section[] }) {
  const sectionsDrag = useDragOrder(sections, (ids) => reorderSections({ courseId, ids }));
  if (sections.length === 0) {
    return <p className="text-graphite">No sections yet. Add the first one below.</p>;
  }

  return (
    <ol className="flex flex-col gap-4">
      {sectionsDrag.error ? (
        <li className="list-none">
          <FieldError message={sectionsDrag.error} />
        </li>
      ) : null}
      {sectionsDrag.ordered.map((section, index) => (
        <SectionBlock
          key={section.id}
          courseId={courseId}
          section={section}
          index={index}
          count={sectionsDrag.ordered.length}
          drag={{
            row: sectionsDrag.row(section.id, index),
            grip: sectionsDrag.grip(section.id),
            lineBefore: sectionsDrag.insertAt === index,
            lineAfter: sectionsDrag.insertAt === sectionsDrag.ordered.length && index === sectionsDrag.ordered.length - 1,
            dragging: sectionsDrag.dragging === section.id,
          }}
        />
      ))}
    </ol>
  );
}
