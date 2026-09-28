"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NewCourseForm } from "./new-course-form";

/** "New course" opens a short form; saving it lands in the course editor. */
export function NewCourseDialog({
  categories,
  label = "New course",
}: {
  categories: { id: string; name: string }[];
  label?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
          <DialogDescription>
            It starts as a draft. You can change all of this later, then add lessons and publish.
          </DialogDescription>
        </DialogHeader>
        <NewCourseForm categories={categories} />
      </DialogContent>
    </Dialog>
  );
}
