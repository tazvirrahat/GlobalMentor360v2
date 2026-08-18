import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { hasRole, requireRole } from "@/lib/session";
import { CouponForm } from "./coupon-form";

export const metadata = { title: "Coupons — Studio" };
export const dynamic = "force-dynamic";

export default async function StudioCouponsPage() {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const isAdmin = await hasRole(user.id, "ADMIN");
  const COUPON_COURSE_CAP = 200;
  const courseWhere = isAdmin ? { status: "PUBLISHED" as const } : { instructorId: user.id };
  const [courses, courseTotal, coupons] = await Promise.all([
    db.course.findMany({
      where: courseWhere,
      orderBy: { title: "asc" },
      take: COUPON_COURSE_CAP,
      select: { id: true, title: true },
    }),
    db.course.count({ where: courseWhere }),
    db.coupon.findMany({
      where: isAdmin
        ? {}
        : {
            OR: [{ courseId: null }, { course: { instructorId: user.id } }],
          },
      orderBy: { code: "asc" },
      take: 50,
      select: {
        id: true,
        code: true,
        type: true,
        value: true,
        courseId: true,
        isActive: true,
        redeemedCount: true,
        maxRedemptions: true,
      },
    }),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link
        href="/studio"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Studio
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Coupons</h1>
      <p className="mt-1 text-muted-foreground">
        Codes apply at checkout. Prices still come from the database; the coupon only records a
        discount.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Create</CardTitle>
          </CardHeader>
          <CardContent>
            <CouponForm courses={courses} canCreateGlobal={isAdmin} />
            {courseTotal > courses.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Showing {courses.length} of {courseTotal} {isAdmin ? "published " : ""}
                courses, ordered by title.
              </p>
            ) : null}
          </CardContent>
        </Card>
        <section>
          <h2 className="text-xl font-bold">Existing</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {coupons.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              coupons.map((coupon) => (
                <li key={coupon.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{coupon.code}</span>
                    <Badge variant={coupon.isActive ? "default" : "secondary"}>
                      {coupon.isActive ? "Active" : "Off"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {coupon.type === "PERCENTAGE" ? `${coupon.value}%` : coupon.value} · redeemed{" "}
                    {coupon.redeemedCount}
                    {coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
