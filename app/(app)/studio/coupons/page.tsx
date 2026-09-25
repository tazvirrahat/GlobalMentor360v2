import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/site/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeCouponValue } from "@/lib/coupon-input";
import { db } from "@/lib/db";
import { clampPage, pageCount, parsePage, showingRange, skipTake } from "@/lib/pagination";
import { hasRole, requireRole } from "@/lib/session";
import { CouponForm } from "./coupon-form";

export const metadata = { title: "Coupons | Studio" };
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

  return (
    <main className="flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Coupons"
        description="Codes learners enter at checkout for a discount. The price itself never changes."
      />

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="coupons-heading" className="flex min-w-0 flex-col gap-3">
          <h2 id="coupons-heading" className="text-lg font-semibold">
            Your coupons
          </h2>
          {coupons.length === 0 ? (
            <EmptyState headingLevel={3} title="No coupons yet" message="Codes you create appear here." />
          ) : (
            <>
              <Table className="md:min-w-[36rem]">
                <TableCaption>Coupons</TableCaption>
                <colgroup>
                  <col className="w-36" />
                  <col />
                  <col className="w-28" />
                  <col className="hidden w-24 md:table-column" />
                  <col className="w-24" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Applies to</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Used</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((coupon) => (
                    <TableRow key={coupon.id}>
                      <TableCell className="font-mono font-semibold break-all text-ink">{coupon.code}</TableCell>
                      <TableCell className="text-graphite">{coupon.course?.title ?? "All courses"}</TableCell>
                      <TableCell className="text-ink">{describeCouponValue(coupon.type, coupon.value)}</TableCell>
                      <TableCell className="hidden text-right text-graphite tabular-nums md:table-cell">
                        {coupon.redeemedCount}
                        {coupon.maxRedemptions ? ` of ${coupon.maxRedemptions}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant={coupon.isActive ? "success" : "secondary"}>
                          {coupon.isActive ? "Active" : "Off"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ListFooter
                range={range}
                total={couponTotal}
                pathname="/studio/coupons"
                page={couponPage}
                pageCount={couponPageCount}
              />
            </>
          )}
        </section>

        <Panel title="New coupon" className="lg:sticky lg:top-6">
          <CouponForm courses={courses} canCreateGlobal={isAdmin} />
          {courseTotal > courses.length ? (
            <p className="text-sm text-graphite">
              Showing {courses.length} of {courseTotal} {isAdmin ? "published " : ""}courses, ordered by title.
            </p>
          ) : null}
        </Panel>
      </div>
    </main>
  );
}
