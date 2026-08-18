import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function FlashAlert({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Alert variant="destructive" className="mt-4" role="alert">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
