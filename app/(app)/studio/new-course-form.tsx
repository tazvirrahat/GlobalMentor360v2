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
        <Input id="title" name="title" required minLength={4} maxLength={120} placeholder="For example, SQL for Analysts" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subtitle">Subtitle (optional)</Label>
        <Input id="subtitle" name="subtitle" maxLength={200} aria-describedby="subtitle-hint" />
        <p id="subtitle-hint" className="text-sm text-graphite">
          One line under the title on the course page.
        </p>
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

      <div className="grid gap-4 sm:grid-cols-2">
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
          <Input id="language" name="language" defaultValue="en" required aria-describedby="language-hint" />
          <p id="language-hint" className="text-sm text-graphite">
            A language code, like en or bn.
          </p>
        </div>
      </div>

      {state.status === "error" ? <FieldError message={state.message} /> : null}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Creating…" : "Create draft"}
      </Button>
    </form>
  );
}
