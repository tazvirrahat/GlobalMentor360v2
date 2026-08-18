"use client";

import { useActionState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeLectureAction, type CompleteLectureState } from "./actions";

const initial: CompleteLectureState = { status: "idle" };

export function CompleteLectureForm({
  itemId,
  slug,
  hasNext,
}: {
  itemId: string;
  slug: string;
  hasNext: boolean;
}) {
  const [state, action, pending] = useActionState(completeLectureAction, initial);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="slug" value={slug} />
      {state.status === "error" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit shadow-brand">
        {pending ? "Saving…" : hasNext ? "Mark complete and continue" : "Mark complete"}
        {hasNext ? <ChevronRight className="size-4" aria-hidden /> : null}
      </Button>
    </form>
  );
}
