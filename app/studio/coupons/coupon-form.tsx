"use client";

import { useActionState } from "react";
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

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" required minLength={3} maxLength={40} placeholder="SAVE20" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Type</Label>
          <Select name="type" defaultValue="PERCENTAGE">
            <SelectTrigger id="type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENTAGE">Percentage</SelectItem>
              <SelectItem value="FIXED">Fixed (minor units)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="value">Value</Label>
          <Input id="value" name="value" type="number" min={1} required defaultValue={20} />
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
          <p className="text-sm text-muted-foreground">
            Create a course first — instructors can only issue coupons for their own courses.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="maxRedemptions">Max redemptions (optional)</Label>
        <Input id="maxRedemptions" name="maxRedemptions" type="number" min={1} />
      </div>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={
            state.status === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium"
          }
        >
          {state.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending || (!canCreateGlobal && courses.length === 0)}
        className="w-fit shadow-brand"
      >
        {pending ? "Creating…" : "Create coupon"}
      </Button>
    </form>
  );
}
