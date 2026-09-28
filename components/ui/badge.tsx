import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-1.5 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] duration-150 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3 focus-ring",
  {
    variants: {
      variant: {
        // Colour carries meaning: verified = done or paid, caution = pending,
        // seal = failed or destructive, mark = "you are here". Everything else is neutral.
        default: "bg-wash text-ink",
        secondary: "bg-wash text-ink",
        outline: "border-rule text-ink",
        success: "bg-verified text-white",
        warning: "bg-caution-wash text-caution",
        destructive: "bg-seal text-white",
        current: "bg-mark text-ink",
        ghost: "text-graphite",
        link: "text-ink underline underline-offset-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
