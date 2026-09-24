import { Badge } from "@/components/ui/badge";

function humanize(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase());
}

export function CourseStatusBadge({ status }: { status: string }) {
  const variant =
    status === "PUBLISHED" ? "success" : status === "IN_REVIEW" ? "warning" : "secondary";
  return <Badge variant={variant}>{humanize(status)}</Badge>;
}

const ORDER_STATUS_TONE: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  PAID: "success",
  PENDING: "warning",
  FAILED: "destructive",
  REFUNDED: "destructive",
  PARTIALLY_REFUNDED: "destructive",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge variant={ORDER_STATUS_TONE[status] ?? "secondary"}>{humanize(status)}</Badge>;
}
