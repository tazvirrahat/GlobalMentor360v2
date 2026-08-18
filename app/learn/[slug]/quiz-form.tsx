"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { CircleCheck, CircleX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { submitQuizAction } from "./actions";

type Question = {
  id: string;
  prompt: string;
  type: string;
  options: { id: string; text: string; position: number }[];
};

type Result = {
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean;
  explanation: string | null;
  correctOptionIds: string[];
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
    selected: boolean;
    explanation: string | null;
  }[];
};

export function QuizForm({
  assessmentId,
  slug,
  questions,
  allowRetakes,
  previous,
  nextHref,
}: {
  assessmentId: string;
  slug: string;
  questions: Question[];
  allowRetakes: boolean;
  previous: { scorePct: number | null; passed: boolean | null } | null;
  nextHref?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [outcome, setOutcome] = useState<{
    scorePct: number;
    passed: boolean;
    threshold: number;
    results: Result[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(questionId: string, optionId: string, multi: boolean) {
    setSelections((prev) => {
      const current = prev[questionId] ?? [];
      if (multi) {
        return {
          ...prev,
          [questionId]: current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId],
        };
      }
      return { ...prev, [questionId]: [optionId] };
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await submitQuizAction({
        assessmentId,
        slug,
        answers: questions.map((question) => ({
          questionId: question.id,
          selectedOptionIds: selections[question.id] ?? [],
        })),
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setOutcome({
        scorePct: result.scorePct,
        passed: result.passed,
        threshold: result.threshold,
        results: result.results,
      });
      router.refresh();
      if (result.passed && nextHref) {
        window.setTimeout(() => {
          router.push(nextHref as Route);
          router.refresh();
        }, 2500);
      }
    });
  }

  if (outcome) {
    return (
      <div className="flex flex-col gap-6">
        <Alert variant={outcome.passed ? "default" : "destructive"}>
          {outcome.passed ? (
            <CircleCheck className="size-4 text-brand" />
          ) : (
            <CircleX className="size-4" />
          )}
          <AlertTitle>
            {outcome.passed ? "Passed" : "Not quite"} — {outcome.scorePct}%
          </AlertTitle>
          <AlertDescription>
            Pass mark is {outcome.threshold}%.
            {outcome.passed
              ? nextHref
                ? " The next lesson is now unlocked — continuing shortly."
                : " The next lesson is now unlocked."
              : allowRetakes
                ? " Review the answers below and try again."
                : " Retakes are not allowed for this quiz."}
          </AlertDescription>
        </Alert>

        <ul className="flex flex-col gap-4">
          {questions.map((question) => {
            const result = outcome.results.find((r) => r.questionId === question.id);
            return (
              <li key={question.id} className="rounded-xl border p-4">
                <p className="font-semibold">{question.prompt}</p>
                <p
                  className={
                    result?.isCorrect
                      ? "mt-1 text-sm font-medium text-brand"
                      : "mt-1 text-sm font-medium text-destructive"
                  }
                >
                  {result?.isCorrect ? "Correct" : "Incorrect"}
                </p>
                {/* The answer key, option by option. Shown only after submitting:
                    this is the review, and a per-option note before that would
                    give the question away. */}
                {result ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {result.options.map((option) => (
                      <li
                        key={option.id}
                        className={
                          option.isCorrect
                            ? "rounded-lg border border-brand/40 bg-brand/5 p-2.5"
                            : option.selected
                              ? "rounded-lg border border-destructive/40 bg-destructive/5 p-2.5"
                              : "rounded-lg border p-2.5"
                        }
                      >
                        <p className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{option.text}</span>
                          {option.isCorrect ? (
                            <span className="text-xs font-semibold text-brand">Correct answer</span>
                          ) : null}
                          {option.selected && !option.isCorrect ? (
                            <span className="text-xs font-semibold text-destructive">
                              You chose this
                            </span>
                          ) : null}
                        </p>
                        {option.explanation ? (
                          <p className="mt-1 text-sm text-muted-foreground">{option.explanation}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {!result?.isCorrect && result?.explanation ? (
                  <p className="mt-3 text-sm text-muted-foreground">{result.explanation}</p>
                ) : null}
              </li>
            );
          })}
        </ul>

        {!outcome.passed && allowRetakes ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOutcome(null);
              setSelections({});
            }}
          >
            Try again
          </Button>
        ) : null}

        {outcome.passed && nextHref ? (
          <Button asChild className="w-fit shadow-brand">
            <a href={nextHref}>Continue to next lesson</a>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {previous?.passed ? (
        <Alert>
          <CircleCheck className="size-4 text-brand" />
          <AlertTitle>Already passed ({previous.scorePct}%)</AlertTitle>
          <AlertDescription>
            {allowRetakes
              ? "You can retake if you want a higher score."
              : "You're done with this quiz."}
          </AlertDescription>
        </Alert>
      ) : null}

      {questions.map((question, index) => {
        const multi = question.type === "MULTI_SELECT";
        const selected = selections[question.id] ?? [];
        return (
          <fieldset key={question.id} className="rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">
              {index + 1}. {question.prompt}
            </legend>
            <ul className="mt-3 flex flex-col gap-2">
              {question.options.map((option) => (
                <li key={option.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={question.id}
                      value={option.id}
                      checked={selected.includes(option.id)}
                      onChange={() => toggle(question.id, option.id, multi)}
                      className="mt-0.5"
                    />
                    {option.text}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-fit shadow-brand">
        {pending ? "Submitting…" : "Submit answers"}
      </Button>
    </form>
  );
}
