"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FAQ_ANSWER_MAX, FAQ_MAX, FAQ_QUESTION_MAX } from "@/lib/course-faq";

type Row = { id: number; question: string; answer: string };

/**
 * The course FAQ: numbered question-and-answer pairs with Add and Remove. Rows
 * post as parallel faqQuestion / faqAnswer arrays, which readFaqRows pairs by
 * position; the hidden faqEditor field tells updateCourse this form owns the FAQ.
 */
export function FaqEditor({ defaults }: { defaults: { question: string; answer: string }[] }) {
  const [rows, setRows] = useState<Row[]>(() => defaults.map((row, index) => ({ id: index, ...row })));
  const [nextId, setNextId] = useState(defaults.length);

  function add() {
    const id = nextId;
    setRows((current) => [...current, { id, question: "", answer: "" }]);
    setNextId(id + 1);
    requestAnimationFrame(() => document.getElementById(`faq-q-${id}`)?.focus());
  }

  function remove(id: number, index: number) {
    setRows((current) => current.filter((row) => row.id !== id));
    requestAnimationFrame(() => {
      const questions = document.querySelectorAll<HTMLInputElement>('input[name="faqQuestion"]');
      (questions[Math.min(index, questions.length - 1)] ?? document.getElementById("faq-add"))?.focus();
    });
  }

  function update(id: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby="faq-hint">
      <input type="hidden" name="faqEditor" value="1" />
      <legend className="text-base font-semibold text-ink">Frequently asked questions</legend>
      <p id="faq-hint" className="-mt-1 text-sm text-graphite">
        Shown near the bottom of the course page. Answer what people ask before they buy.
      </p>
      {rows.length === 0 ? <p className="text-sm text-graphite">No questions yet.</p> : null}
      <ol className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-md border border-rule p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`faq-q-${row.id}`}>Question {index + 1}</Label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove question ${index + 1}`}
                onClick={() => remove(row.id, index)}
              >
                <X aria-hidden />
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input
                id={`faq-q-${row.id}`}
                name="faqQuestion"
                value={row.question}
                onChange={(event) => update(row.id, { question: event.target.value })}
                maxLength={FAQ_QUESTION_MAX}
                placeholder="For example: Do I need any software?"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`faq-a-${row.id}`}>Answer {index + 1}</Label>
              <Textarea
                id={`faq-a-${row.id}`}
                name="faqAnswer"
                value={row.answer}
                onChange={(event) => update(row.id, { answer: event.target.value })}
                maxLength={FAQ_ANSWER_MAX}
                rows={3}
              />
            </div>
          </li>
        ))}
      </ol>
      <Button id="faq-add" type="button" variant="secondary" size="sm" className="w-fit" onClick={add} disabled={rows.length >= FAQ_MAX}>
        <Plus aria-hidden /> Add a question
      </Button>
    </fieldset>
  );
}
