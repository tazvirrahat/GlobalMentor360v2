"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldError } from "@/components/site/field-error";
import { createCouponAction, type CouponState } from "./actions";

const initial: CouponState = { status: "idle" };

export function CouponForm({
  courses,
  canCreateGlobal,
}: {
  courses: { id: string; title: string }[];
  canCreateGlobal: boolean;
}) {
  const [state, action, pending] = useActionState(createCouponAction, initial);
  const defaultCourse = canCreateGlobal ? "all" : (courses[0]?.id ?? "");
  // A hidden input carries the type (the Radix select's own native control can
  // submit a stale value); the value field's label follows it.
  const [type, setType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const percent = type === "PERCENTAGE";

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          required
          minLength={3}
          maxLength={40}
          placeholder="SAVE20"
          autoComplete="off"
          aria-describedby="code-hint"
          className="font-mono uppercase"
        />
        <p id="code-hint" className="text-sm text-graphite">
          What learners type at checkout, at least 3 characters. Not case-sensitive.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Discount</Label>
          <input type="hidden" name="type" value={type} />
          <Select value={type} onValueChange={(next) => setType(next === "FIXED" ? "FIXED" : "PERCENTAGE")}>
            <SelectTrigger id="type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENTAGE">Percent off</SelectItem>
              <SelectItem value="FIXED">Amount off</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="value">{percent ? "Percent" : "Amount"}</Label>
          <Input
            key={type}
            id="value"
            name="value"
            type="number"
            inputMode="decimal"
            min={percent ? 1 : 0.01}
            max={percent ? 100 : undefined}
            step={percent ? 1 : 0.01}
            required
            defaultValue={percent ? 20 : undefined}
            aria-describedby="value-hint"
          />
          <p id="value-hint" className="text-sm text-graphite">
            {percent ? "From 1 to 100." : "Taken off in the currency the learner pays in, like 500 for ৳500."}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="courseId">Course</Label>
        <Select name="courseId" defaultValue={defaultCourse} required>
          <SelectTrigger id="courseId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {canCreateGlobal ? <SelectItem value="all">All courses</SelectItem> : null}
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!canCreateGlobal && courses.length === 0 ? (
          <p className="text-sm text-graphite">Create a course first. Coupons apply to your own courses.</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="maxRedemptions">Use limit (optional)</Label>
        <Input
          id="maxRedemptions"
          name="maxRedemptions"
          type="number"
          min={1}
          step={1}
          aria-describedby="max-hint"
          className="sm:max-w-40"
        />
        <p id="max-hint" className="text-sm text-graphite">
          How many times it can be used in total. Leave empty for no limit.
        </p>
      </div>
      {state.status === "error" ? <FieldError message={state.message} /> : null}
      {state.status === "done" ? (
        <p role="status" className="text-sm font-medium text-ink">
          {state.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending || (!canCreateGlobal && courses.length === 0)}
        className="w-fit"
      >
        {pending ? "Creating…" : "Create coupon"}
      </Button>
    </form>
  );
}
