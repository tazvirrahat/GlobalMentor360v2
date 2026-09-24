"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * A drawer on Radix Dialog: focus is trapped inside, Esc and the overlay close
 * it, and focus returns to the trigger. Used for the phone menu, the phone
 * curriculum and the phone app sidebar.
 */
const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

const SIDES = {
  left: "inset-y-0 left-0 h-dvh w-[min(20rem,calc(100vw-3rem))] border-r data-[state=open]:slide-in-from-left",
  right:
    "inset-y-0 right-0 h-dvh w-[min(20rem,calc(100vw-3rem))] border-l data-[state=open]:slide-in-from-right",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg border-t data-[state=open]:slide-in-from-bottom",
} as const;

function SheetContent({
  side = "right",
  title,
  titleHidden = false,
  description,
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof SIDES;
  /** Every sheet is named; hide it visually only when the content already says it. */
  title: string;
  titleHidden?: boolean;
  description?: string;
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col overscroll-contain border-rule bg-surface shadow-md outline-none",
          "data-[state=open]:animate-in data-[state=open]:duration-200",
          SIDES[side],
          className,
        )}
        // Without a description Radix warns unless aria-describedby is explicitly unset.
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-rule pr-2 pl-4">
          <SheetPrimitive.Title
            className={cn("min-w-0 flex-1 truncate text-base font-semibold", titleHidden && "sr-only")}
          >
            {title}
          </SheetPrimitive.Title>
          <SheetPrimitive.Close className="ml-auto inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink hover:bg-wash focus-ring">
            <XIcon className="size-5" aria-hidden />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        </div>
        {description ? (
          <SheetPrimitive.Description className="sr-only">{description}</SheetPrimitive.Description>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetClose, SheetContent, SheetTrigger };
