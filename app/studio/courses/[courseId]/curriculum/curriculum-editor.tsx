"use client";

import { useActionState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addItem,
  addSection,
  deleteItem,
  deleteSection,
  moveItem,
  togglePreview,
  type CurriculumState,
} from "../../../curriculum-actions";

const initial: CurriculumState = { status: "idle" };

type Item = {
  id: string;
  title: string;
  type: string;
  position: number;
  isPreview: boolean;
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
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex min-w-52 flex-1 flex-col gap-1.5">
        <Label htmlFor="new-section">New section title</Label>
        <Input id="new-section" name="title" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add section"}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="w-full text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function AddItemForm({ sectionId }: { sectionId: string }) {
  const [state, action, pending] = useActionState(addItem, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="sectionId" value={sectionId} />
      <div className="flex min-w-52 flex-1 flex-col gap-1.5">
        <Label htmlFor={`item-${sectionId}`}>New lecture title</Label>
        <Input id={`item-${sectionId}`} name="title" required />
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Add lecture"}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="w-full text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function ItemControls({ item, isFirst, isLast }: { item: Item; isFirst: boolean; isLast: boolean }) {
  const [, move, moving] = useActionState(moveItem, initial);
  const [, toggle, toggling] = useActionState(togglePreview, initial);
  const [, remove, removing] = useActionState(deleteItem, initial);

  return (
    <span className="flex items-center gap-1">
      <form action={move}>
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="direction" value="up" />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={moving || isFirst}
          aria-label={`Move ${item.title} up`}
        >
          <ArrowUp aria-hidden />
        </Button>
      </form>

      <form action={move}>
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="direction" value="down" />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={moving || isLast}
          aria-label={`Move ${item.title} down`}
        >
          <ArrowDown aria-hidden />
        </Button>
      </form>

      <form action={toggle}>
        <input type="hidden" name="itemId" value={item.id} />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={toggling}
          aria-label={item.isPreview ? `Disable preview for ${item.title}` : `Enable preview for ${item.title}`}
        >
          {item.isPreview ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
        </Button>
      </form>

      <form action={remove}>
        <input type="hidden" name="itemId" value={item.id} />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={removing}
          aria-label={`Delete ${item.title}`}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 aria-hidden />
        </Button>
      </form>
    </span>
  );
}

function DeleteSectionForm({ sectionId }: { sectionId: string }) {
  const [, action, pending] = useActionState(deleteSection, initial);

  return (
    <form action={action}>
      <input type="hidden" name="sectionId" value={sectionId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 aria-hidden /> Delete section
      </Button>
    </form>
  );
}

export function SectionList({ sections }: { sections: Section[] }) {
  if (sections.length === 0)
    return <p className="text-muted-foreground">No sections yet — add the first one below.</p>;

  return (
    <ol className="flex flex-col gap-6">
      {sections.map((section) => (
        <li key={section.id}>
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="font-bold">{section.title}</h3>
              <DeleteSectionForm sectionId={section.id} />
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              {section.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lectures in this section.</p>
              ) : (
                <ol className="flex flex-col divide-y">
                  {section.items.map((item, index) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex items-center gap-2 text-sm">
                        {item.title}
                        {item.isPreview ? (
                          <Badge variant="outline" className="text-brand">
                            Preview
                          </Badge>
                        ) : null}
                      </span>
                      <ItemControls
                        item={item}
                        isFirst={index === 0}
                        isLast={index === section.items.length - 1}
                      />
                    </li>
                  ))}
                </ol>
              )}

              <AddItemForm sectionId={section.id} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
