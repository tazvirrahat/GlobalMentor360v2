"use client";

import { useActionState } from "react";
import { setPublished, updateCourse, type ActionState } from "../../actions";

const initial: ActionState = { status: "idle" };

type Course = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  level: string;
  language: string;
  status: string;
  prices: { currency: string; amount: number }[];
};

export function SettingsForm({ course }: { course: Course }) {
  const [state, action, pending] = useActionState(updateCourse, initial);
  const primary = course.prices[0];

  return (
    <form action={action}>
      <input type="hidden" name="courseId" value={course.id} />

      <label htmlFor="title">Title</label>
      <input id="title" name="title" defaultValue={course.title} required minLength={4} />

      <label htmlFor="subtitle">Subtitle</label>
      <input id="subtitle" name="subtitle" defaultValue={course.subtitle ?? ""} />

      <label htmlFor="description">Description</label>
      <textarea id="description" name="description" defaultValue={course.description ?? ""} rows={5} />

      <label htmlFor="level">Level</label>
      <select id="level" name="level" defaultValue={course.level}>
        <option value="BEGINNER">Beginner</option>
        <option value="INTERMEDIATE">Intermediate</option>
        <option value="ADVANCED">Advanced</option>
        <option value="ALL_LEVELS">All levels</option>
      </select>

      <label htmlFor="language">Language</label>
      <input id="language" name="language" defaultValue={course.language} required />

      <fieldset>
        <legend>Price</legend>
        <label htmlFor="priceAmount">Amount</label>
        <input
          id="priceAmount"
          name="priceAmount"
          type="number"
          step="0.01"
          min="0"
          defaultValue={primary ? (primary.amount / 100).toFixed(2) : ""}
        />
        <label htmlFor="priceCurrency">Currency</label>
        <select id="priceCurrency" name="priceCurrency" defaultValue={primary?.currency ?? "USD"}>
          <option value="USD">USD</option>
          <option value="BDT">BDT (required for bKash)</option>
        </select>
      </fieldset>

      {state.status !== "idle" ? <p role="status">{state.message}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function PublishForm({
  courseId,
  status,
  ready,
}: {
  courseId: string;
  status: string;
  ready: boolean;
}) {
  const [state, action, pending] = useActionState(setPublished, initial);
  const published = status === "PUBLISHED";

  return (
    <form action={action}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="publish" value={published ? "false" : "true"} />

      <button type="submit" disabled={pending || (!published && !ready)}>
        {pending ? "Working…" : published ? "Unpublish" : "Publish"}
      </button>

      {!published && !ready ? <p>Complete the checklist before publishing.</p> : null}
      {state.status !== "idle" ? <p role="status">{state.message}</p> : null}
    </form>
  );
}
