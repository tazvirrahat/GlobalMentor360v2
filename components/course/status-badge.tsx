import { Badge } from "@/components/ui/badge";
import { statusLabel, statusTone, type StatusKind, type StatusTone } from "@/lib/status";

const VARIANT: Record<StatusTone, "success" | "warning" | "destructive" | "outline"> = {
  verified: "success",
  caution: "warning",
  seal: "destructive",
  neutral: "outline",
};

/** A status in words, in the colour that status means. Text only, no dots. */
export function StatusBadge({ kind, status, className }: { kind: StatusKind; status: string; className?: string }) {
  const tone = statusTone(kind, status);
  return (
    <Badge variant={VARIANT[tone]} className={tone === "neutral" ? `text-graphite ${className ?? ""}` : className}>
      {statusLabel(kind, status)}
    </Badge>
  );
}
