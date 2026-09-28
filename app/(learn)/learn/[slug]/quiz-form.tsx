"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { CircleCheck, CircleX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
        <Alert variant={outcome.passed ? "verified" : "destructive"} role="status">
          {outcome.passed ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
          <AlertTitle>
            {outcome.passed ? "Passed" : "Not passed yet"}: {outcome.scorePct}%
          </AlertTitle>
          <AlertDescription>
            Pass mark is {outcome.threshold}%.
            {outcome.passed
              ? nextHref
                ? " The next lesson is open. Continuing shortly."
                : " The next lesson is open."
              : allowRetakes
                ? " Review the answers below and try again."
                : " Retakes are not allowed for this quiz."}
          </AlertDescription>
        </Alert>

        <ul className="flex flex-col gap-4">
          {questions.map((question) => {
            const result = outcome.results.find((r) => r.questionId === question.id);
            return (
              <li key={question.id} className="rounded-lg border border-rule bg-surface p-4">
                <p className="font-semibold">{question.prompt}</p>
                <p
                  className={cn(
                    "mt-1 flex items-center gap-1.5 text-sm font-medium",
                    result?.isCorrect ? "text-verified" : "text-seal",
                  )}
                >
                  {result?.isCorrect ? (
                    <CircleCheck className="size-4" aria-hidden />
                  ) : (
                    <CircleX className="size-4" aria-hidden />
                  )}
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
                        className={cn(
                          "rounded-md border border-rule p-2.5 motion-safe:transition-colors motion-safe:duration-200",
                          option.isCorrect && "border-verified bg-surface",
                          !option.isCorrect && option.selected && "border-seal bg-surface",
                        )}
                      >
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{option.text}</span>
                          {option.isCorrect ? (
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-verified">
                              <CircleCheck className="size-3.5" aria-hidden />
                              Correct answer
                            </span>
                          ) : null}
                          {option.selected && !option.isCorrect ? (
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-seal">
                              <CircleX className="size-3.5" aria-hidden />
                              You chose this
                            </span>
                          ) : null}
                        </p>
                        {option.explanation ? (
                          <p className="mt-1 text-sm text-graphite">{option.explanation}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {!result?.isCorrect && result?.explanation ? (
                  <p className="mt-3 text-sm text-graphite">{result.explanation}</p>
                ) : null}
              </li>
            );
          })}
        </ul>

        {!outcome.passed && allowRetakes ? (
          <Button
            type="button"
            size="lg"
            className="w-fit"
            onClick={() => {
              setOutcome(null);
              setSelections({});
            }}
          >
            Try again
          </Button>
        ) : null}

        {outcome.passed && nextHref ? (
          <Button asChild size="lg" className="w-fit">
            <a href={nextHref}>Next lesson</a>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {previous?.passed ? (
        <Alert variant="verified">
          <CircleCheck className="size-4" />
          <AlertTitle>You passed this quiz with {previous.scorePct}%</AlertTitle>
          <AlertDescription>
            {allowRetakes
              ? "You can take it again for a higher score."
              : "You are done with this quiz."}
          </AlertDescription>
        </Alert>
      ) : null}

      {questions.map((question, index) => {
        const multi = question.type === "MULTI_SELECT";
        const selected = selections[question.id] ?? [];
        return (
          <fieldset key={question.id} className="flex flex-col gap-3">
            <legend className="mb-3 flex flex-col gap-1">
              <span className="text-sm text-graphite">
                Question {index + 1} of {questions.length}
                {multi ? ", choose all that apply" : ""}
              </span>
              <span className="text-lg font-semibold text-ink">{question.prompt}</span>
            </legend>
            <ul className="flex flex-col gap-2">
              {question.options.map((option) => (
                <li key={option.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-rule bg-surface px-3 py-2 text-base transition-colors duration-150 hover:bg-wash has-[:checked]:border-ink has-[:checked]:bg-wash">
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={question.id}
                      value={option.id}
                      checked={selected.includes(option.id)}
                      onChange={() => toggle(question.id, option.id, multi)}
                      className="size-6 shrink-0 cursor-pointer accent-ink"
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
        <p role="alert" className="text-sm font-medium text-seal">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Submitting…" : "Submit answers"}
      </Button>
    </form>
  );
}
