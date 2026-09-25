"use client";

import { useActionState, useState } from "react";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COURSE_TAG_MAX } from "@/lib/taxonomy-rules";
import { courseTaxonomyAction, type TaxonomyState } from "../../taxonomy/actions";

const idle: TaxonomyState = { status: "idle" };

type Option = { id: string; name: string };

function TagChecks({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: Option[];
  selected: string[];
}) {
  const hintId = `${name}-hint`;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hintId}>
      <legend className="text-base font-semibold text-ink">{legend}</legend>
      <p id={hintId} className="text-sm text-graphite">
        {options.length === 0 ? "None exist yet. Add them in Admin › Taxonomy." : `Up to ${COURSE_TAG_MAX}.`}
      </p>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.id} className="flex min-h-8 w-fit cursor-pointer items-center gap-2.5 text-ink">
            <input
              type="checkbox"
              name={name}
              value={option.id}
              defaultChecked={selected.includes(option.id)}
              className="size-5 shrink-0 cursor-pointer accent-ink"
            />
            {option.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A course's category, topics and skills, set by an admin. */
export function CourseTaxonomyForm({
  courseId,
  subjects,
  topics,
  skills,
  current,
}: {
  courseId: string;
  subjects: (Option & { children: Option[] })[];
  topics: Option[];
  skills: Option[];
  current: { categoryId: string | null; topicIds: string[]; skillIds: string[] };
}) {
  const [category, setCategory] = useState(current.categoryId ?? "none");
  const [state, action, pending] = useActionState(courseTaxonomyAction, idle);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex max-w-sm flex-col gap-1.5">
        <Label htmlFor="course-category">Category</Label>
        <input type="hidden" name="categoryId" value={category} />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="course-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No category</SelectItem>
            {subjects.map((subject) => (
              <SelectGroup key={subject.id}>
                <SelectLabel>{subject.name}</SelectLabel>
                <SelectItem value={subject.id}>{subject.name} (whole subject)</SelectItem>
                {subject.children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {child.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TagChecks legend="Topics" name="topicId" options={topics} selected={current.topicIds} />
      <TagChecks legend="Skills" name="skillId" options={skills} selected={current.skillIds} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.status === "done" ? (
          <p role="status" className="text-sm font-medium text-ink">
            {state.message}
          </p>
        ) : null}
      </div>
      {state.status === "error" ? <FieldError message={state.message} /> : null}
    </form>
  );
}
