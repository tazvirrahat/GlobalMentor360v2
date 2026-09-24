import Link from "next/link";
import { ArrowLeft, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/site/empty-state";
import { PageNav } from "@/components/site/page-nav";
import { db } from "@/lib/db";
import { clampPage, pageCount, parsePage, showingRange, skipTake } from "@/lib/pagination";
import { hasRole, requireRole } from "@/lib/session";
import { CouponForm } from "./coupon-form";

export const metadata = { title: "Coupons — Studio" };
export const dynamic = "force-dynamic";

const COUPON_PAGE_SIZE = 20;

export default async function StudioCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const isAdmin = await hasRole(user.id, "ADMIN");
  const { page: rawPage } = await searchParams;
  const COUPON_COURSE_CAP = 200;
  const courseWhere = isAdmin ? { status: "PUBLISHED" as const } : { instructorId: user.id };
  const couponWhere = isAdmin
    ? {}
    : {
        OR: [{ courseId: null }, { course: { instructorId: user.id } }],
      };
  const couponTotal = await db.coupon.count({ where: couponWhere });
  const couponPage = clampPage(parsePage(rawPage), couponTotal, COUPON_PAGE_SIZE);
  const { skip, take } = skipTake(couponPage, COUPON_PAGE_SIZE);
  const couponPageCount = pageCount(couponTotal, COUPON_PAGE_SIZE);
  const range = showingRange(couponPage, COUPON_PAGE_SIZE, couponTotal);
  const [courses, courseTotal, coupons] = await Promise.all([
    db.course.findMany({
      where: courseWhere,
      orderBy: { title: "asc" },
      take: COUPON_COURSE_CAP,
      select: { id: true, title: true },
    }),
    db.course.count({ where: courseWhere }),
    db.coupon.findMany({
      where: couponWhere,
      orderBy: { code: "asc" },
      skip,
      take,
      select: {
        id: true,
        code: true,
        type: true,
        value: true,
        courseId: true,
        isActive: true,
        redeemedCount: true,
        maxRedemptions: true,
        course: { select: { title: true } },
      },
    }),
  ]);

  const pager = (
    <>
      {coupons.length > 0 ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          Showing {range.from}–{range.to} of {couponTotal}
        </p>
      ) : null}
      <PageNav pathname="/studio/coupons" page={couponPage} pageCount={couponPageCount} />
    </>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/studio"
        className="inline-flex w-fit cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Studio
      </Link>
      <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight">Coupons</h1>
      <p className="mt-1 text-muted-foreground">
        Codes apply at checkout. Prices still come from the database; the coupon only records a
        discount.
      </p>

      <div className="mt-8 grid min-w-0 items-start gap-8 lg:grid-cols-2">
        <Card>
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
        <section className="min-w-0">
          <h2 className="font-heading text-xl font-semibold tracking-tight">Existing</h2>
          {coupons.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={<Ticket className="size-6" />}
              title="No coupons yet"
              message="Codes you create appear here. They apply at checkout."
            />
          ) : (
            <div className="mt-3 flex min-w-0 flex-col gap-2">
              {pager}
              <div className="w-0 min-w-full overflow-x-auto rounded-lg border bg-card shadow-sm">
                <div className="hidden min-w-[32rem] border-b bg-muted/40 px-3 py-1.5 text-sm font-medium text-muted-foreground sm:grid sm:grid-cols-[8rem_minmax(0,1fr)_5.5rem_5rem_auto] sm:gap-3">
                  <span>Code</span>
                  <span>Scope</span>
                  <span className="text-right">Usage</span>
                  <span className="text-right">Value</span>
                  <span className="sr-only">Status</span>
                </div>
                <ul>
                  {coupons.map((coupon) => (
                    <li
                      key={coupon.id}
                      className="border-b border-border px-3 py-1.5 text-sm last:border-b-0 hover:bg-muted/50"
                    >
                      <div className="grid min-w-[32rem] items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_5.5rem_5rem_auto] sm:gap-3">
                        <span className="font-mono font-semibold tracking-tight">{coupon.code}</span>
                        <span
                          className="min-w-0 truncate text-muted-foreground"
                          title={coupon.course?.title ?? "All courses"}
                        >
                          {coupon.course?.title ?? "All courses"}
                        </span>
                        <span className="tabular-nums text-muted-foreground sm:text-right">
                          {coupon.redeemedCount}
                          {coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ""}
                        </span>
                        <span className="tabular-nums text-muted-foreground sm:text-right">
                          {coupon.type === "PERCENTAGE" ? `${coupon.value}%` : coupon.value}
                        </span>
                        <Badge variant={coupon.isActive ? "success" : "secondary"}>
                          {coupon.isActive ? "Active" : "Off"}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              {pager}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
