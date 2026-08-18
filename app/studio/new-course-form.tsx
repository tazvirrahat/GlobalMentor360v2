"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COURSE_LEVELS } from "@/lib/labels";
import { FieldError } from "@/components/site/field-error";
import { createCourse, type ActionState } from "./actions";

const initial: ActionState = { status: "idle" };

export function NewCourseForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createCourse, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required minLength={4} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subtitle">Subtitle</Label>
        <Input id="subtitle" name="subtitle" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <Select name="categoryId" defaultValue="none">
          <SelectTrigger id="categoryId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Uncategorised</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="level">Level</Label>
        <Select name="level" defaultValue="ALL_LEVELS">
          <SelectTrigger id="level" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COURSE_LEVELS.map((level) => (
              <SelectItem key={level.value} value={level.value}>
                {level.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="language">Language</Label>
        <Input id="language" name="language" defaultValue="en" required />
      </div>

      {state.status === "error" ? <FieldError message={state.message} /> : null}

      <Button type="submit" disabled={pending} className="shadow-brand">
        {pending ? "Creating…" : "Create draft"}
      </Button>
    </form>
  );
}
