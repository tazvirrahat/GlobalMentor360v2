"use client";

import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field with a Show/Hide toggle (WCAG 3.3.8: people can check what
 * they typed instead of retyping it). Paste is never blocked, and autocomplete
 * comes from the caller ("current-password" or "new-password").
 */
export function PasswordInput({
  className,
  wrapperClassName,
  id,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & {
  /** Width and layout go here, so the toggle stays inside the field. */
  wrapperClassName?: string;
}) {
  const [visible, setVisible] = useState(false);
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input id={inputId} type={visible ? "text" : "password"} className={cn("pr-12", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-controls={inputId}
        aria-pressed={visible}
        aria-label="Show password"
        className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-graphite hover:bg-wash hover:text-ink focus-ring"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
