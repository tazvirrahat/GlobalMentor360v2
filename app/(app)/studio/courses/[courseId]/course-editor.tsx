"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { CourseEditorNav } from "@/components/app/course-editor-nav";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COURSE_EDITOR_LABELS, type CourseEditorTab } from "@/lib/course-editor";
import { COURSE_LEVELS } from "@/lib/labels";
import { updateCourse, type ActionState } from "../../actions";
import { FaqEditor } from "./faq-editor";
import { ListEditor } from "./list-editor";

const initial: ActionState = { status: "idle" };

export type EditableCourse = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  level: string;
  language: string;
  prices: { currency: string; amount: number }[];
  objectives: { text: string }[];
  requirements: { text: string }[];
  targetAudience: { text: string }[];
  faqs: { question: string; answer: string }[];
};

function Panel({
  tab,
  current,
  description,
  children,
}: {
  tab: Exclude<CourseEditorTab, "publish">;
  current: CourseEditorTab;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      data-tab={tab}
      hidden={tab !== current}
      aria-labelledby={`${tab}-heading`}
      className="flex flex-col gap-5 rounded-lg border border-rule bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${tab}-heading`} className="text-xl font-semibold">
          {COURSE_EDITOR_LABELS[tab]}
        </h2>
        <p className="text-sm text-graphite">{description}</p>
      </div>
      {children}
    </section>
  );
}

function writeTabToUrl(next: CourseEditorTab) {
  const url = new URL(window.location.href);
  if (next === "details") url.searchParams.delete("tab");
  else url.searchParams.set("tab", next);
  window.history.replaceState(null, "", url);
}

function amountText(prices: EditableCourse["prices"], currency: string) {
  const price = prices.find((row) => row.currency === currency);
  return price ? String(price.amount / 100) : "";
}

/**
 * The course editor (spec §6 Studio). Details, Landing page and Pricing are one
 * form with one Save — the panels stay mounted when hidden, so switching tabs
 * never loses an edit — and Publish is its own panel with its own action.
 * The tab lives in `?tab=`, updated with replaceState.
 */
export function CourseEditor({
  course,
  initialTab,
  publishPanel,
  published,
}: {
  course: EditableCourse;
  initialTab: CourseEditorTab;
  publishPanel: ReactNode;
  published: boolean;
}) {
  const [tab, setTab] = useState<CourseEditorTab>(initialTab);
  const [state, action, pending] = useActionState(updateCourse, initial);
  const form = useRef<HTMLFormElement>(null);

  // Hidden inputs, not Select `name`: Radix Select hydrates a native control
  // whose submitted value can disagree with defaultValue.
  const [level, setLevel] = useState(course.level);
  // Prefer BDT when both exist — that is the price bKash charges.
  const [currency, setCurrency] = useState(
    course.prices.some((price) => price.currency === "BDT") ? "BDT" : (course.prices[0]?.currency ?? "BDT"),
  );
  const [amount, setAmount] = useState(() => amountText(course.prices, currency));

  function select(next: CourseEditorTab) {
    setTab(next);
    writeTabToUrl(next);
  }

  // A required field in a hidden tab: show that tab before the browser tries
  // to focus the field and explain what is wrong. `invalid` does not bubble,
  // so this listens in the capture phase on the form.
  useEffect(() => {
    const node = form.current;
    if (!node) return;
    let handled = false;
    function onInvalid(event: Event) {
      if (handled) return;
      handled = true;
      queueMicrotask(() => {
        handled = false;
      });
      const panel = (event.target as HTMLElement).closest<HTMLElement>("[data-tab]");
      const next = panel?.dataset.tab as CourseEditorTab | undefined;
      if (next) {
        flushSync(() => setTab(next));
        writeTabToUrl(next);
      }
    }
    node.addEventListener("invalid", onInvalid, true);
    return () => node.removeEventListener("invalid", onInvalid, true);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <CourseEditorNav courseId={course.id} current={tab} onSelect={select} />

      <form ref={form} action={action} hidden={tab === "publish"} className="flex flex-col gap-6">
        <input type="hidden" name="courseId" value={course.id} />

        <Panel tab="details" current={tab} description="The basics learners see first, in search and at the top of the course page.">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={course.title} required minLength={4} maxLength={120} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input
              id="subtitle"
              name="subtitle"
              defaultValue={course.subtitle ?? ""}
              maxLength={200}
              aria-describedby="subtitle-hint"
            />
            <p id="subtitle-hint" className="text-sm text-graphite">
              One line under the title. Learners read it in search results.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={course.description ?? ""}
              rows={6}
              maxLength={5000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="level">Level</Label>
              <input type="hidden" name="level" value={level} />
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger id="level" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COURSE_LEVELS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                name="language"
                defaultValue={course.language}
                required
                minLength={2}
                maxLength={10}
                aria-describedby="language-hint"
              />
              <p id="language-hint" className="text-sm text-graphite">
                A language code, like en or bn.
              </p>
            </div>
          </div>
        </Panel>

        <Panel tab="landing" current={tab} description="The lists on the course page. Short lines read best; empty lines are dropped.">
          <ListEditor
            name="objectives"
            legend="What you'll learn"
            hint="The checklist near the top of the course page. One idea per line."
            noun="Objective"
            addLabel="Add an objective"
            defaults={course.objectives.map((row) => row.text)}
          />
          <ListEditor
            name="requirements"
            legend="Requirements"
            hint="What a learner should know or have before starting."
            noun="Requirement"
            addLabel="Add a requirement"
            defaults={course.requirements.map((row) => row.text)}
          />
          <ListEditor
            name="audience"
            legend="Who this course is for"
            hint="Describe the learners this course suits."
            noun="Audience"
            addLabel="Add an audience"
            defaults={course.targetAudience.map((row) => row.text)}
          />
          <FaqEditor defaults={course.faqs} />
        </Panel>

        <Panel tab="pricing" current={tab} description="What the course costs. Enter 0 to make it free.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priceCurrency">Currency</Label>
              <input type="hidden" name="priceCurrency" value={currency} />
              <Select
                value={currency}
                onValueChange={(next) => {
                  setCurrency(next);
                  // Show that currency's own price; never carry an amount across.
                  setAmount(amountText(course.prices, next));
                }}
              >
                <SelectTrigger id="priceCurrency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BDT">Taka (BDT)</SelectItem>
                  <SelectItem value="USD">US dollars (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priceAmount">Price</Label>
              <Input
                id="priceAmount"
                name="priceAmount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-describedby="price-hint"
              />
            </div>
          </div>
          <p id="price-hint" className="text-sm text-graphite">
            Learners who pay with bKash are charged the taka price, so a course needs one to be bought with bKash. The
            dollar price is for card payments. Saving changes the currency shown here only; the other price stays as it
            is.
          </p>
        </Panel>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <p role="status" className="text-sm font-medium text-ink">
            {state.status === "done" ? state.message : ""}
          </p>
          {state.status === "error" ? <FieldError message={state.message} /> : null}
        </div>
      </form>

      <section
        hidden={tab !== "publish"}
        aria-labelledby="publish-heading"
        className="flex flex-col gap-5 rounded-lg border border-rule bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="publish-heading" className="text-xl font-semibold">
            Publish
          </h2>
          <p className="text-sm text-graphite">
            {published
              ? "This course is on sale. Unpublishing takes it out of the catalog."
              : "The course goes on sale when you publish it. Every item below has to be done first."}
          </p>
        </div>
        {publishPanel}
      </section>
    </div>
  );
}
