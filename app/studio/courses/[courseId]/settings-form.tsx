"use client";

import { useActionState, useState } from "react";
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
import { COURSE_LEVELS } from "@/lib/labels";

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
  objectives: { text: string }[];
  requirements: { text: string }[];
  targetAudience: { text: string }[];
};

function LineList({
  name,
  label,
  hint,
  defaults,
}: {
  name: string;
  label: string;
  hint: string;
  defaults: string[];
}) {
  const rows = defaults.length > 0 ? defaults : [""];
  return (
    <fieldset className="rounded-xl border p-4">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      <div className="flex flex-col gap-2">
        {rows.map((text, index) => (
          <Input
            key={`${name}-${index}-${text.slice(0, 12)}`}
            name={name}
            defaultValue={text}
            maxLength={300}
          />
        ))}
        {/* Always leave blank rows so authors can add lines without a client widget. */}
        {Array.from({ length: 2 }, (_, index) => (
          <Input key={`${name}-blank-${index}`} name={name} maxLength={300} />
        ))}
      </div>
    </fieldset>
  );
}

export function SettingsForm({ course }: { course: Course }) {
  const [state, action, pending] = useActionState(updateCourse, initial);
  // Prefer the BDT row when both rails exist — that is the price bKash can take.
  // Do not invent a BDT amount from USD.
  const primary = course.prices.find((price) => price.currency === "BDT") ?? course.prices[0];
  // Hidden inputs, not Select `name`: Radix Select hydrates a native control
  // whose submitted value can disagree with defaultValue.
  const [level, setLevel] = useState(course.level);
  const [currency, setCurrency] = useState(primary?.currency ?? "BDT");

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

      <LineList
        name="objectives"
        label="What you'll learn"
        hint="Shown as the landing-page checklist. One idea per line."
        defaults={course.objectives.map((row) => row.text)}
      />
      <LineList
        name="requirements"
        label="Requirements"
        hint="What a learner should already know."
        defaults={course.requirements.map((row) => row.text)}
      />
      <LineList
        name="audience"
        label="Who this course is for"
        hint="The audience section on the public landing page."
        defaults={course.targetAudience.map((row) => row.text)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="level">Level</Label>
          <input type="hidden" name="level" value={level} />
          <Select value={level} onValueChange={setLevel}>
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
            <input type="hidden" name="priceCurrency" value={currency} />
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="priceCurrency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BDT">BDT (required for bKash)</SelectItem>
                <SelectItem value="USD">USD (card, when configured)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          bKash charges the BDT price. Without one, a published course cannot be
          bought unless card payments are configured. Saving updates this currency
          only — it does not copy or convert an amount into the other currency.
        </p>
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
