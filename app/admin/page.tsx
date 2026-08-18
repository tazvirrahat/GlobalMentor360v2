import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

export default async function AdminIndexPage() {
  await requireRole("ADMIN");
  redirect("/admin/payments");
}
