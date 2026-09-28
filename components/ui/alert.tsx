import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      // Colour carries meaning: caution = pending, verified = done or
      // confirmed, destructive = something failed. Descriptions stay ink so the
      // body text keeps full contrast.
      variant: {
        default: "border-rule bg-surface text-ink [&>svg]:text-ink",
        caution:
          "border-caution/30 bg-caution-wash text-caution *:data-[slot=alert-description]:text-ink [&>svg]:text-caution",
        verified:
          "border-verified/40 bg-surface text-ink [&>svg]:text-verified",
        destructive:
          "border-seal/40 bg-surface text-seal *:data-[slot=alert-description]:text-ink [&>svg]:text-seal",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  // No default role: a notice that is on the page when it loads is not an
  // alert. Callers pass role="alert" for an error that appears after an
  // action, role="status" for a confirmation.
  return (
    <div
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 min-h-4 font-semibold",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-ink [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
