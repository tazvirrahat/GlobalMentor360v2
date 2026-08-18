import { Badge } from "@/components/ui/badge";

export function CourseStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "PUBLISHED" ? "default" : "secondary"}>{status}</Badge>;
}

const ORDER_STATUS_TONE: Record<string, "default" | "secondary" | "destructive"> = {
  // PAID is the only status worth colouring green; the rest read as neutral or bad.
  PAID: "default",
  PENDING: "secondary",
  FAILED: "destructive",
  REFUNDED: "destructive",
  PARTIALLY_REFUNDED: "destructive",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={ORDER_STATUS_TONE[status] ?? "secondary"}>
      {status.replace("_", " ").toLowerCase()}
    </Badge>
  );
}
