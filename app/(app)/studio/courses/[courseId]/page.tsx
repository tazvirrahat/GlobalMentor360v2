import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ExternalLink, TriangleAlert, X } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/course/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { pickEditorTab } from "@/lib/course-editor";
import { courseImageUrl } from "@/lib/course-image";
import { db } from "@/lib/db";
import { courseSellabilityWarning } from "@/lib/payments";
import { formatDateMedium } from "@/lib/format";
import { hasRole, requireRole } from "@/lib/session";
import { isStorageConfigured } from "@/lib/storage";
import { getOwnedCourse, readinessChecks } from "@/lib/studio";
import { CourseEditor } from "./course-editor";
import { CourseImageField } from "./course-image-field";
import { PublishForm } from "./publish-form";

export const metadata = { title: "Edit course | Studio" };
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function CourseEditorPage({ params, searchParams }: Params) {
  const { courseId } = await params;
  const { tab } = await searchParams;
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  // Returns null for another instructor's course as well as a missing one, so a
  // 404 is the correct response either way — and it doesn't confirm existence.
  const course = await getOwnedCourse(courseId, user.id);
  if (!course) notFound();

  const [checks, isAdmin, categories] = await Promise.all([
    readinessChecks(course.id),
    hasRole(user.id, "ADMIN"),
    // Subcategories, like the new-course dialog, plus the current one if an admin filed it under a whole subject.
    db.category.findMany({
      where: { OR: [{ parentId: { not: null } }, ...(course.primaryCategoryId ? [{ id: course.primaryCategoryId }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const ready = checks.every((check) => check.ok);
  const published = course.status === "PUBLISHED";
  const sellabilityWarning = courseSellabilityWarning(course.prices);

  const publishPanel = (
    <>
      {course.reviewNote && course.status === "DRAFT" ? (
        <Alert variant="caution">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Returned for changes</AlertTitle>
          <AlertDescription>
            <p className="whitespace-pre-line">{course.reviewNote}</p>
            <p className="mt-1 text-sm">Make the changes, then submit it again.</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <ul className="flex flex-col gap-3">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-3">
            {check.ok ? (
              <Check className="mt-0.5 size-5 shrink-0 text-verified" aria-hidden />
            ) : (
              <X className="mt-0.5 size-5 shrink-0 text-seal" aria-hidden />
            )}
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-ink">
                <span className="sr-only">{check.ok ? "Done: " : "To do: "}</span>
                {check.label}
              </span>
              {check.ok ? null : <span className="text-sm text-graphite">{check.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
      <PublishForm
        courseId={course.id}
        status={course.status}
        ready={ready}
        canPublishDirectly={isAdmin}
        reviewRequestedLabel={course.reviewRequestedAt ? formatDateMedium(course.reviewRequestedAt) : null}
      />
      {published ? (
        <p className="text-sm text-graphite">Changes you save to a live course show on its page straight away.</p>
      ) : null}
    </>
  );

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        back={{ href: "/studio" as Route, label: "Courses" }}
        title={course.title}
        meta={<StatusBadge kind="course" status={course.status} />}
        actions={
          published ? (
            <Link
              href={`/courses/${course.slug}` as Route}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
            >
              Course page <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />

      {sellabilityWarning ? (
        <Alert variant={published ? "destructive" : "caution"}>
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>{published ? "On sale, but nobody can pay for it" : "Not ready to sell yet"}</AlertTitle>
          <AlertDescription>{sellabilityWarning}</AlertDescription>
        </Alert>
      ) : null}

      <CourseEditor
        course={course}
        categories={categories}
        initialTab={pickEditorTab(tab)}
        imageField={
          <CourseImageField
            courseId={course.id}
            title={course.title}
            slug={course.slug}
            imageUrl={courseImageUrl(course.id, course.thumbnailUrl)}
            storageReady={isStorageConfigured()}
          />
        }
        publishPanel={publishPanel}
        published={published}
      />
    </main>
  );
}
