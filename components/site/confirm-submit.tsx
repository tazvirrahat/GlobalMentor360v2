"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A destructive submit that asks first: the first click turns into
 * "Delete note?" with Yes and Cancel, so a slip does not lose anything.
 * Must sit inside the form it submits. Cancel puts focus back on the trigger.
 *
 * With `icon`, the trigger is a 32px icon button whose accessible name is
 * `label` (for dense rows such as the curriculum editor).
 *
 * With `onConfirm`, the yes button runs it instead of submitting, for a control
 * that sits inside a form it must not submit (the course image on Details).
 */
export function ConfirmSubmit({
  label,
  question,
  confirmLabel,
  size = "sm",
  icon,
  disabled = false,
  variant = "ghost",
  onConfirm,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  size?: "sm" | "default";
  icon?: ReactNode;
  disabled?: boolean;
  /** The trigger's look; the confirm button is always destructive. */
  variant?: "ghost" | "secondary";
  onConfirm?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  function cancel() {
    refocus.current = true;
    setAsking(false);
  }

  if (!asking) {
    const ref = (node: HTMLButtonElement | null) => {
      trigger.current = node;
      if (node && refocus.current) {
        refocus.current = false;
        node.focus();
      }
    };
    return icon ? (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        {icon}
      </Button>
    ) : (
      <Button ref={ref} type="button" variant={variant} size={size} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={question}>
      <span className="text-sm font-medium text-ink">{question}</span>
      {onConfirm ? (
        <Button
          type="button"
          variant="destructive"
          size={size}
          autoFocus
          onClick={() => {
            refocus.current = true;
            setAsking(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      ) : (
        <Button type="submit" variant="destructive" size={size} autoFocus>
          {confirmLabel}
        </Button>
      )}
      <Button type="button" variant="secondary" size={size} onClick={cancel}>
        Cancel
      </Button>
    </span>
  );
}
