import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { CourseEditorNav } from "@/components/app/course-editor-nav";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/course/status-badge";
import { requireRole } from "@/lib/session";
import { getOwnedCurriculum } from "@/lib/studio";
import { tryDrainMediaConvertEventQueue } from "@/lib/video";
import { AddSectionForm, SectionList } from "./curriculum-editor";

export const metadata = { title: "Curriculum | Studio" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string }> };

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The course editor's Curriculum tab: sections and their lectures and quizzes, in order. */
export default async function CurriculumPage({ params }: Params) {
  const { courseId } = await params;
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  await tryDrainMediaConvertEventQueue();

  const course = await getOwnedCurriculum(courseId, user.id);
  if (!course) notFound();

  const items = course.sections.flatMap((section) => section.items);
  const quizzes = items.filter((item) => item.type === "QUIZ").length;
  const lectures = items.length - quizzes;

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        back={{ href: "/studio" as Route, label: "Courses" }}
        title={course.title}
        meta={<StatusBadge kind="course" status={course.status} />}
        actions={
          course.status === "PUBLISHED" ? (
            <Link
              href={`/courses/${course.slug}` as Route}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
            >
              Course page <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />
      <CourseEditorNav courseId={course.id} current="curriculum" />

      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Curriculum</h2>
        <p className="text-sm text-graphite">
          {count(course.sections.length, "section", "sections")}, {count(lectures, "lecture", "lectures")},{" "}
          {count(quizzes, "quiz", "quizzes")}. Learners take them in this order; a quiz must be passed before what
          follows it opens.
        </p>
      </div>

      <SectionList courseId={course.id} sections={course.sections} />

      <section aria-labelledby="add-section-heading" className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5">
        <h2 id="add-section-heading" className="text-base font-semibold">
          Add a section
        </h2>
        <AddSectionForm courseId={course.id} />
      </section>
    </main>
  );
}
