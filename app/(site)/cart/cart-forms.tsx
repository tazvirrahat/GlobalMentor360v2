"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { enrollFreeCartItems, type CartState } from "./actions";

const freeInitial: CartState = { status: "idle" };

export function EnrollFreeCartButton() {
  const [state, action, pending] = useActionState(
    async (_prev: CartState) => enrollFreeCartItems(),
    freeInitial,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" disabled={pending} variant="outline">
        {pending ? "Enrolling…" : "Enrol free courses"}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <p role="status" className="text-sm font-medium">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
