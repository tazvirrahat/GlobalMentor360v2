"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * A destructive submit that asks first: the first click turns into
 * "Delete note?" with Yes and Cancel, so a slip does not lose anything.
 * Must sit inside the form it submits.
 */
export function ConfirmSubmit({
  label,
  question,
  confirmLabel,
  size = "sm",
}: {
  label: string;
  question: string;
  confirmLabel: string;
  size?: "sm" | "default";
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button type="button" variant="ghost" size={size} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={question}>
      <span className="text-sm font-medium text-ink">{question}</span>
      <Button type="submit" variant="destructive" size={size} autoFocus>
        {confirmLabel}
      </Button>
      <Button type="button" variant="secondary" size={size} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}
