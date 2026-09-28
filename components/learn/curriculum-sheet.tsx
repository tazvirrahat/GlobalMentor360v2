"use client";

import { useState, type ReactNode } from "react";
import { ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

/**
 * Below lg: "Contents" in the top bar opens the curriculum as a sheet. The list
 * is server-rendered and passed in; choosing a lesson closes the sheet.
 */
export function CurriculumSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary" size="lg" className="px-3 lg:hidden">
          <ListTree className="size-4" strokeWidth={1.75} aria-hidden />
          Contents
        </Button>
      </SheetTrigger>
      <SheetContent side="left" title="Course contents">
        {/* Event delegation: any lesson link closes the sheet as it navigates. */}
        <div
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest("a[href]")) setOpen(false);
          }}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
