"use client";

import { useActionState, useId } from "react";
import { Megaphone } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/site/field-error";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_SUBJECT_MAX,
} from "@/lib/announcement-rules";
import { publishAnnouncement, type AnnouncementState } from "./actions";

const initial: AnnouncementState = { status: "idle" };

export type AnnouncableCourse = {
  id: string;
  title: string;
  learnerCount: number;
};

export function Composer({
  courses,
  defaultCourseId,
}: {
  courses: AnnouncableCourse[];
  defaultCourseId?: string;
}) {
  const uid = useId();
  const [state, action, pending] = useActionState(publishAnnouncement, initial);
  const selectedCourseId = defaultCourseId ?? courses[0]?.id;

  if (courses.length === 0) {
    return (
      <p className="text-muted-foreground">
        You do not teach any courses yet. Create one before announcing anything.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`course-${uid}`}>Course</Label>
        <Select name="courseId" defaultValue={selectedCourseId}>
          <SelectTrigger id={`course-${uid}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title} ({course.learnerCount}{" "}
                {course.learnerCount === 1 ? "learner" : "learners"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`subject-${uid}`}>Subject</Label>
        <Input
          id={`subject-${uid}`}
          name="subject"
          required
          minLength={4}
          maxLength={ANNOUNCEMENT_SUBJECT_MAX}
          placeholder="New section on generics is live"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`body-${uid}`}>Message</Label>
        <Textarea
          id={`body-${uid}`}
          name="body"
          required
          rows={8}
          maxLength={ANNOUNCEMENT_BODY_MAX}
          placeholder="What has changed, and what should learners do about it?"
        />
      </div>

      {state.status === "error" ? <FieldError message={state.message} /> : null}
      {state.status === "done" ? (
        <p role="status" className="text-sm font-medium text-primary">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-fit">
        <Megaphone className="size-4" aria-hidden />
        {pending ? "Sending…" : "Send to enrolled learners"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Every learner with a live enrollment gets this by email and sees it in the course.
        Refunded learners do not.
      </p>
    </form>
  );
}
