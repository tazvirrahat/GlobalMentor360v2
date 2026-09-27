import type { Route } from "next";
import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/course/status-badge";
import { EmptyState } from "@/components/site/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableLinkClass,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDateMedium } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { courseSellabilityWarning } from "@/lib/payments";
import { requireRole } from "@/lib/session";
import { listInstructorCourses, STUDIO_COURSE_PAGE_SIZE } from "@/lib/studio";
import { NewCourseDialog } from "./new-course-dialog";
import { getViewerTimeZone } from "@/lib/viewer-time";

export const metadata = { title: "Courses | Studio" };
export const dynamic = "force-dynamic";

/** The instructor's own courses (spec §6 Studio), newest edit first. */
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const timeZone = await getViewerTimeZone();
  const { page: rawPage } = await searchParams;
  const [{ items: courses, total, page, pageCount }, categories] = await Promise.all([
    listInstructorCourses(user.id, rawPage),
    db.category.findMany({
      where: { parentId: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const range = showingRange(page, STUDIO_COURSE_PAGE_SIZE, total);

  return (
    <main className="flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Courses"
        description="Create a course, build its lessons, then publish it."
        actions={courses.length > 0 ? <NewCourseDialog categories={categories} /> : null}
      />

      {courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          message="Start with a title. The course stays a draft until you publish it."
        >
          <NewCourseDialog categories={categories} label="Create your first course" />
        </EmptyState>
      ) : (
        <>
          <Table className="md:min-w-[44rem]">
            <TableCaption>Your courses</TableCaption>
            <colgroup>
              <col />
              <col className="w-32" />
              <col className="hidden w-28 md:table-column" />
              <col className="hidden w-36 md:table-column" />
              <col className="hidden w-40 md:table-column" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden text-right md:table-cell">Learners</TableHead>
                <TableHead className="hidden md:table-cell">Updated</TableHead>
                <TableHead className="hidden md:table-cell">
                  <span className="sr-only">Links</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => {
                const warning = course.status === "PUBLISHED" ? courseSellabilityWarning(course.prices) : null;
                const sections = course._count.sections;
                return (
                  <TableRow key={course.id}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <Link href={`/studio/courses/${course.id}` as Route} className={tableLinkClass}>
                          <span className="md:truncate">{course.title}</span>
                        </Link>
                        <span className="flex flex-wrap gap-x-3 text-sm text-graphite">
                          <span>
                            {sections === 0 ? "No sections yet" : `${sections} ${sections === 1 ? "section" : "sections"}`}
                          </span>
                          <span className="md:hidden">
                            {course.enrollmentCount} {course.enrollmentCount === 1 ? "learner" : "learners"}
                          </span>
                        </span>
                        {warning ? (
                          <span className="flex items-start gap-1 text-sm font-medium text-seal">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                            {warning}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="course" status={course.status} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{course.enrollmentCount}</TableCell>
                    <TableCell className="hidden text-graphite md:table-cell">
                      <time dateTime={course.updatedAt.toISOString()}>{formatDateMedium(course.updatedAt, timeZone)}</time>
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {course.status === "PUBLISHED" ? (
                        <Link
                          href={`/courses/${course.slug}` as Route}
                          className="inline-flex min-h-8 items-center gap-1 rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                        >
                          Course page <ExternalLink className="size-3.5" aria-hidden />
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ListFooter range={range} total={total} pathname="/studio" page={page} pageCount={pageCount} />
        </>
      )}
    </main>
  );
}
