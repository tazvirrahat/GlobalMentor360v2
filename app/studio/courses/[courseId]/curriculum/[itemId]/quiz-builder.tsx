"use client";

import { useActionState, useCallback, useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, CircleCheck, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { MAX_OPTIONS, TRUE_FALSE_LABELS } from "@/lib/assessment-rules";
import {
  deleteQuestion,
  moveQuestion,
  saveQuestion,
  updateAssessment,
  type AssessmentState,
} from "../../../../assessment-actions";

const initial: AssessmentState = { status: "idle" };

type QuestionType = "SINGLE_CHOICE" | "MULTI_SELECT" | "TRUE_FALSE";

export type EditableAssessment = {
  id: string;
  description: string | null;
  timeLimitSeconds: number | null;
  passThresholdPct: number | null;
  shuffleQuestions: boolean;
  allowRetakes: boolean;
  questions: {
    id: string;
    prompt: string;
    type: string;
    explanation: string | null;
    knowledgeArea: string | null;
    position: number;
    options: {
      id: string;
      text: string;
      isCorrect: boolean;
      explanation: string | null;
      position: number;
    }[];
  }[];
};

type Question = EditableAssessment["questions"][number];

const TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTI_SELECT: "Multi-select",
  TRUE_FALSE: "True / false",
};

function isQuestionType(value: string): value is QuestionType {
  return value in TYPE_LABELS;
}

/** Row keys only need to be unique within one open editor. */
let nextRowKey = 0;

type OptionRow = {
  key: number;
  id: string;
  text: string;
  correct: boolean;
  /** "" rather than null: this is a controlled input's value, not the stored column. */
  explanation: string;
};

function blankRow(text = "", correct = false): OptionRow {
  nextRowKey += 1;
  return { key: nextRowKey, id: "", text, correct, explanation: "" };
}

function rowsFor(question: Question | null): OptionRow[] {
  if (!question) return [blankRow(), blankRow()];
  return question.options.map((option) => {
    nextRowKey += 1;
    return {
      key: nextRowKey,
      id: option.id,
      text: option.text,
      correct: option.isCorrect,
      explanation: option.explanation ?? "",
    };
  });
}

function StatusLine({ state }: { state: AssessmentState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role="status"
      className={
        state.status === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium"
      }
    >
      {state.message}
    </p>
  );
}

function SettingsForm({
  itemId,
  title,
  assessment,
}: {
  itemId: string;
  title: string;
  assessment: EditableAssessment;
}) {
  const [state, action, pending] = useActionState(updateAssessment, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="itemId" value={itemId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={title} required maxLength={200} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Instructions</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={assessment.description ?? ""}
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="passThresholdPct">Pass mark (%)</Label>
          <Input
            id="passThresholdPct"
            name="passThresholdPct"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={assessment.passThresholdPct ?? 70}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timeLimitMinutes">Time limit (minutes)</Label>
          <Input
            id="timeLimitMinutes"
            name="timeLimitMinutes"
            type="number"
            min={1}
            max={600}
            placeholder="No limit"
            defaultValue={
              assessment.timeLimitSeconds ? Math.round(assessment.timeLimitSeconds / 60) : ""
            }
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">Behaviour</legend>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="allowRetakes" defaultChecked={assessment.allowRetakes} />
          Allow retakes after a pass
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="shuffleQuestions"
            defaultChecked={assessment.shuffleQuestions}
          />
          Shuffle questions
        </label>

        <p className="text-xs text-muted-foreground">
          The pass mark and retake rule are applied when an attempt is graded. The time limit and
          shuffle are stored but the player does not act on them yet.
        </p>
      </fieldset>

      <StatusLine state={state} />

      <Button type="submit" disabled={pending} className="w-fit shadow-brand">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}

function QuestionEditorForm({
  itemId,
  question,
  onClose,
}: {
  itemId: string;
  question: Question | null;
  onClose: () => void;
}) {
  // Two editors can be open at once (editing one question while adding
  // another). Fixed ids would collide and point every <label for> at the first
  // form's control.
  const uid = useId();
  const [state, action, pending] = useActionState(saveQuestion, initial);
  const [type, setType] = useState<QuestionType>(
    question && isQuestionType(question.type) ? question.type : "SINGLE_CHOICE",
  );
  const [rows, setRows] = useState<OptionRow[]>(() => rowsFor(question));

  // The action revalidates this route, so a saved question re-renders from the
  // server. Leaving the editor open would show a second, now-stale copy of it.
  useEffect(() => {
    if (state.status === "done") onClose();
  }, [state, onClose]);

  function changeType(next: QuestionType) {
    setType(next);
    setRows((current) => {
      if (next === "TRUE_FALSE") {
        // Keep the first two ids so the existing rows are updated rather than
        // deleted and recreated; the labels themselves are not the author's, but
        // the notes written against them are, so they survive the switch.
        return TRUE_FALSE_LABELS.map((text, index) => ({
          key: current[index]?.key ?? blankRow().key,
          id: current[index]?.id ?? "",
          text,
          correct: current[index]?.correct ?? false,
          explanation: current[index]?.explanation ?? "",
        }));
      }
      if (next === "SINGLE_CHOICE") {
        // Drop all but the first correct mark, so switching down from
        // multi-select doesn't submit a state the server has to refuse.
        let seen = false;
        return current.map((row) => {
          const correct = row.correct && !seen;
          if (row.correct) seen = true;
          return { ...row, correct };
        });
      }
      return current;
    });
  }

  function updateRow(key: number, patch: Partial<OptionRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function setCorrect(key: number, correct: boolean) {
    setRows((current) =>
      current.map((row) =>
        row.key === key
          ? { ...row, correct }
          : // Single-answer types allow one mark, so selecting one clears the rest.
            type === "MULTI_SELECT"
            ? row
            : { ...row, correct: false },
      ),
    );
  }

  const trueFalse = type === "TRUE_FALSE";
  const multi = type === "MULTI_SELECT";

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border p-4">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="questionId" value={question?.id ?? ""} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`prompt-${uid}`}>Question</Label>
        <Textarea id={`prompt-${uid}`} name="prompt" defaultValue={question?.prompt ?? ""} rows={2} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`type-${uid}`}>Type</Label>
          <Select
            name="type"
            value={type}
            onValueChange={(value) => {
              if (isQuestionType(value)) changeType(value);
            }}
          >
            <SelectTrigger id={`type-${uid}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`knowledgeArea-${uid}`}>Knowledge area</Label>
          <Input
            id={`knowledgeArea-${uid}`}
            name="knowledgeArea"
            defaultValue={question?.knowledgeArea ?? ""}
            placeholder="Optional tag, e.g. “Type system”"
            maxLength={80}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">
          Answers{" "}
          <span className="font-normal text-muted-foreground">
            {trueFalse
              ? "— pick the correct side"
              : multi
                ? "— tick every correct option"
                : "— pick the one correct option"}
          </span>
        </legend>

        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={row.key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <input type="hidden" name="optionId" value={row.id} />
                <input
                  type={multi ? "checkbox" : "radio"}
                  name="correct"
                  value={index}
                  checked={row.correct}
                  onChange={(event) => setCorrect(row.key, event.target.checked)}
                  aria-label={`Mark answer ${index + 1} correct`}
                />

                {trueFalse ? (
                  <>
                    <input type="hidden" name="optionText" value={row.text} />
                    <span className="text-sm">{row.text}</span>
                  </>
                ) : (
                  <>
                    <Input
                      name="optionText"
                      value={row.text}
                      onChange={(event) => updateRow(row.key, { text: event.target.value })}
                      aria-label={`Answer ${index + 1}`}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={rows.length <= 2}
                      aria-label={`Remove answer ${index + 1}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setRows((current) => current.filter((item) => item.key !== row.key))
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                )}
              </div>

              {/*
                One optionExplanation per row, rendered inside the row it belongs
                to. readOptionDrafts pairs the option arrays by position, so a row
                that skipped this input — including a True/False row — would slide
                every later note onto the wrong answer. It is labelled rather than
                <Label htmlFor>-ed because two editors can be open at once and the
                ids would collide.
              */}
              <Input
                name="optionExplanation"
                value={row.explanation}
                onChange={(event) => updateRow(row.key, { explanation: event.target.value })}
                aria-label={`Explanation for answer ${index + 1}`}
                placeholder="Why this answer is right or wrong (optional)"
                maxLength={2000}
                className="ml-6 h-8 text-xs"
              />
            </li>
          ))}
        </ul>

        {trueFalse ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={rows.length >= MAX_OPTIONS}
            onClick={() => setRows((current) => [...current, blankRow()])}
          >
            <Plus aria-hidden /> Add answer
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          Per-answer notes are saved against each option. The player currently shows the
          question-level explanation below, not these.
        </p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`explanation-${uid}`}>Explanation</Label>
        <Textarea
          id={`explanation-${uid}`}
          name="explanation"
          defaultValue={question?.explanation ?? ""}
          rows={2}
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">
          Shown to a learner who gets this question wrong.
        </p>
      </div>

      <StatusLine state={state} />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="shadow-brand">
          {pending ? "Saving…" : question ? "Save question" : "Add question"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function QuestionControls({
  question,
  isFirst,
  isLast,
  onEdit,
}: {
  question: Question;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
}) {
  // Both results are rendered, not discarded. These actions fail the same way
  // every other one does — "Question not found." after the row was deleted in
  // another tab — and dropping the state left the author clicking a button that
  // did nothing and said nothing.
  const [moveState, move, moving] = useActionState(moveQuestion, initial);
  const [removeState, remove, removing] = useActionState(deleteQuestion, initial);

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
        <form action={move}>
          <input type="hidden" name="questionId" value={question.id} />
          <input type="hidden" name="direction" value="up" />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            disabled={moving || isFirst}
            aria-label="Move question up"
          >
            <ArrowUp aria-hidden />
          </Button>
        </form>

        <form action={move}>
          <input type="hidden" name="questionId" value={question.id} />
          <input type="hidden" name="direction" value="down" />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            disabled={moving || isLast}
            aria-label="Move question down"
          >
            <ArrowDown aria-hidden />
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="Edit question"
        >
          <Pencil aria-hidden />
        </Button>

        <form action={remove}>
          <input type="hidden" name="questionId" value={question.id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            disabled={removing}
            aria-label="Delete question"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 aria-hidden />
          </Button>
        </form>
      </span>

      <StatusLine state={moveState} />
      <StatusLine state={removeState} />
    </div>
  );
}

function QuestionCard({
  question,
  index,
  isFirst,
  isLast,
  onEdit,
}: {
  question: Question;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
}) {
  const label = isQuestionType(question.type) ? TYPE_LABELS[question.type] : question.type;

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">
          {index + 1}. {question.prompt}
        </p>
        <QuestionControls
          question={question}
          isFirst={isFirst}
          isLast={isLast}
          onEdit={onEdit}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{label}</Badge>
        {question.knowledgeArea ? (
          <Badge variant="outline">{question.knowledgeArea}</Badge>
        ) : null}
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        {question.options.map((option) => (
          <li key={option.id} className="flex items-start gap-2">
            {option.isCorrect ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-label="Correct" />
            ) : (
              <span className="mt-0.5 size-4 shrink-0" />
            )}
            <span className="flex flex-col">
              <span className={option.isCorrect ? "font-medium" : "text-muted-foreground"}>
                {option.text}
              </span>
              {option.explanation ? (
                <span className="text-xs text-muted-foreground">{option.explanation}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {question.explanation ? (
        <p className="text-xs text-muted-foreground">{question.explanation}</p>
      ) : null}
    </div>
  );
}

export function QuizBuilder({
  itemId,
  title,
  assessment,
}: {
  itemId: string;
  title: string;
  assessment: EditableAssessment;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const closeEditor = useCallback(() => setEditingId(null), []);
  const closeAdd = useCallback(() => setAdding(false), []);

  return (
    <div className="flex flex-col gap-8">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Quiz settings</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm itemId={itemId} title={title} assessment={assessment} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Questions ({assessment.questions.length})</CardTitle>
          {adding ? null : (
            <Button type="button" size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden /> Add question
            </Button>
          )}
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {assessment.questions.length === 0 ? (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              This quiz has no questions, so every learner passes it by submitting an empty form —
              the next item unlocks and it counts toward their certificate. Add a question before
              publishing.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {assessment.questions.map((question, index) => (
                <li key={question.id}>
                  {editingId === question.id ? (
                    <QuestionEditorForm
                      key={question.id}
                      itemId={itemId}
                      question={question}
                      onClose={closeEditor}
                    />
                  ) : (
                    <QuestionCard
                      question={question}
                      index={index}
                      isFirst={index === 0}
                      isLast={index === assessment.questions.length - 1}
                      onEdit={() => setEditingId(question.id)}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}

          {adding ? (
            <QuestionEditorForm key="new" itemId={itemId} question={null} onClose={closeAdd} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
