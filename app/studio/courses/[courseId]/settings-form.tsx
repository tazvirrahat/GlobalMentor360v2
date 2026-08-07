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
import { Textarea } from "@/components/ui/textarea";
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
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="courseId" value={course.id} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={course.title} required minLength={4} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subtitle">Subtitle</Label>
        <Input id="subtitle" name="subtitle" defaultValue={course.subtitle ?? ""} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={course.description ?? ""}
          rows={5}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="level">Level</Label>
          <Select name="level" defaultValue={course.level}>
            <SelectTrigger id="level" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BEGINNER">Beginner</SelectItem>
              <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
              <SelectItem value="ADVANCED">Advanced</SelectItem>
              <SelectItem value="ALL_LEVELS">All levels</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="language">Language</Label>
          <Input id="language" name="language" defaultValue={course.language} required />
        </div>
      </div>

      <fieldset className="rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">Price</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="priceAmount">Amount</Label>
            <Input
              id="priceAmount"
              name="priceAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={primary ? (primary.amount / 100).toFixed(2) : ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="priceCurrency">Currency</Label>
            <Select name="priceCurrency" defaultValue={primary?.currency ?? "USD"}>
              <SelectTrigger id="priceCurrency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="BDT">BDT (required for bKash)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </fieldset>

      {state.status !== "idle" ? (
        <p role="status" className="text-sm font-medium">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-fit shadow-brand">
        {pending ? "Saving…" : "Save"}
      </Button>
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
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="publish" value={published ? "false" : "true"} />

      <Button
        type="submit"
        disabled={pending || (!published && !ready)}
        variant={published ? "outline" : "default"}
        className={published ? "" : "shadow-brand"}
      >
        {pending ? "Working…" : published ? "Unpublish" : "Publish"}
      </Button>

      {!published && !ready ? (
        <p className="text-xs text-muted-foreground">Complete the checklist before publishing.</p>
      ) : null}
      {state.status !== "idle" ? (
        <p role="status" className="text-sm font-medium">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
