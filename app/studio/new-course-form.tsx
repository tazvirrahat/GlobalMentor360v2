"use client";

import { useActionState } from "react";
import { createCourse, type ActionState } from "./actions";

const initial: ActionState = { status: "idle" };

export function NewCourseForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createCourse, initial);

  return (
    <form action={action}>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" required minLength={4} />

      <label htmlFor="subtitle">Subtitle</label>
      <input id="subtitle" name="subtitle" />

      <label htmlFor="categoryId">Category</label>
      <select id="categoryId" name="categoryId" defaultValue="">
        <option value="">Uncategorised</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>

      <label htmlFor="level">Level</label>
      <select id="level" name="level" defaultValue="ALL_LEVELS">
        <option value="BEGINNER">Beginner</option>
        <option value="INTERMEDIATE">Intermediate</option>
        <option value="ADVANCED">Advanced</option>
        <option value="ALL_LEVELS">All levels</option>
      </select>

      <label htmlFor="language">Language</label>
      <input id="language" name="language" defaultValue="en" required />

      {state.status === "error" ? <p role="alert">{state.message}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
