"use client";

import { useActionState, useState } from "react";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { grantCourseAction, userStatusAction, type UserAdminState } from "./actions";

const idle: UserAdminState = { status: "idle" };

function Result({ state }: { state: UserAdminState }) {
  if (state.status === "error") return <FieldError message={state.message} />;
  if (state.status === "done") {
    return (
      <p role="status" className="text-sm font-medium text-ink">
        {state.message}
      </p>
    );
  }
  return null;
}

/** Suspend asks first; Unsuspend does not (it only gives access back). */
export function StatusForm({ userId, suspended }: { userId: string; suspended: boolean }) {
  const [state, action, pending] = useActionState(userStatusAction, idle);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={suspended ? "ACTIVE" : "SUSPENDED"} />
      {suspended ? (
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Restoring…" : "Unsuspend"}
        </Button>
      ) : (
        <ConfirmSubmit
          label="Suspend account"
          question="Suspend and sign them out?"
          confirmLabel={pending ? "Suspending…" : "Suspend"}
          size="default"
          variant="secondary"
        />
      )}
      <Result state={state} />
    </form>
  );
}

export function GrantCourseForm({ userId, courses }: { userId: string; courses: { id: string; title: string }[] }) {
  const [course, setCourse] = useState("none");
  const [state, action, pending] = useActionState(async (prev: UserAdminState, formData: FormData) => {
    const result = await grantCourseAction(prev, formData);
    if (result.status === "done") setCourse("none");
    return result;
  }, idle);

  if (courses.length === 0) return <p className="text-sm text-graphite">They already have every published course.</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="grant-course">Course</Label>
          <input type="hidden" name="courseId" value={course} />
          <Select value={course} onValueChange={setCourse}>
            <SelectTrigger id="grant-course" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Pick a course</SelectItem>
              {courses.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={pending || course === "none"}>
          {pending ? "Giving…" : "Give course"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}
