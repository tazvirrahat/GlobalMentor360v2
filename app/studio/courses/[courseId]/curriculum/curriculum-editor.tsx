"use client";

import { useActionState } from "react";
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
    <form action={action}>
      <input type="hidden" name="courseId" value={courseId} />
      <label htmlFor="new-section">New section title</label>
      <input id="new-section" name="title" required />
      <button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add section"}
      </button>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
    </form>
  );
}

function AddItemForm({ sectionId }: { sectionId: string }) {
  const [state, action, pending] = useActionState(addItem, initial);

  return (
    <form action={action}>
      <input type="hidden" name="sectionId" value={sectionId} />
      <label htmlFor={`item-${sectionId}`}>New lecture title</label>
      <input id={`item-${sectionId}`} name="title" required />
      <button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add lecture"}
      </button>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
    </form>
  );
}

function ItemControls({ item, isFirst, isLast }: { item: Item; isFirst: boolean; isLast: boolean }) {
  const [, move, moving] = useActionState(moveItem, initial);
  const [, toggle, toggling] = useActionState(togglePreview, initial);
  const [, remove, removing] = useActionState(deleteItem, initial);

  return (
    <span>
      <form action={move} style={{ display: "inline" }}>
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" disabled={moving || isFirst} aria-label={`Move ${item.title} up`}>
          ↑
        </button>
      </form>

      <form action={move} style={{ display: "inline" }}>
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" disabled={moving || isLast} aria-label={`Move ${item.title} down`}>
          ↓
        </button>
      </form>

      <form action={toggle} style={{ display: "inline" }}>
        <input type="hidden" name="itemId" value={item.id} />
        <button type="submit" disabled={toggling}>
          {item.isPreview ? "Preview on" : "Preview off"}
        </button>
      </form>

      <form action={remove} style={{ display: "inline" }}>
        <input type="hidden" name="itemId" value={item.id} />
        <button type="submit" disabled={removing}>
          Delete
        </button>
      </form>
    </span>
  );
}

function DeleteSectionForm({ sectionId }: { sectionId: string }) {
  const [, action, pending] = useActionState(deleteSection, initial);

  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="sectionId" value={sectionId} />
      <button type="submit" disabled={pending}>
        Delete section
      </button>
    </form>
  );
}

export function SectionList({ sections }: { sections: Section[] }) {
  if (sections.length === 0) return <p>No sections yet.</p>;

  return (
    <ol>
      {sections.map((section) => (
        <li key={section.id}>
          <h3>
            {section.title} <DeleteSectionForm sectionId={section.id} />
          </h3>

          {section.items.length === 0 ? (
            <p>No lectures in this section.</p>
          ) : (
            <ol>
              {section.items.map((item, index) => (
                <li key={item.id}>
                  {item.title}
                  {item.isPreview ? <strong> · Preview</strong> : null}{" "}
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
        </li>
      ))}
    </ol>
  );
}
