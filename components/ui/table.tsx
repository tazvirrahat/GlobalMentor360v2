import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The one table style (spec §5 app shell): fixed columns so rows line up
 * whatever their content, a header that stays in view on desktop, a `wash`
 * row hover. Phones scroll the table sideways inside its container; from lg
 * the container stops clipping so the sticky header can follow the page.
 */
function Table({ className, fixed = true, ...props }: React.ComponentProps<"table"> & { fixed?: boolean }) {
  return (
    <div data-slot="table-container" className="relative w-full min-w-0 overflow-x-auto lg:overflow-visible">
      <table
        data-slot="table"
        className={cn("w-full border-collapse text-sm", fixed && "table-fixed", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-paper lg:sticky lg:top-0 lg:z-10 [&_tr]:border-b [&_tr]:border-rule", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-rule bg-wash font-medium", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-rule hover:bg-wash/60", className)}
      {...props}
    />
  )
}

function TableHead({ className, scope = "col", ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope={scope}
      className={cn("h-10 px-3 text-left align-middle text-sm font-semibold text-graphite", className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 py-2.5 align-middle", className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("sr-only", className)} {...props} />
}

/** The title cell's link: the row's way in, at least 24px tall. */
const tableLinkClass =
  "inline-flex min-h-6 max-w-full items-center rounded-sm font-medium text-ink hover:underline focus-ring"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  tableLinkClass,
}
