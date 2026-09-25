import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { StatusBadge } from "@/components/course/status-badge";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { Button } from "@/components/ui/button";
import { getAdminCourse } from "@/lib/admin";
import { formatDateMedium } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { getCourseTaxonomy, listTaxonomy } from "@/lib/taxonomy";
import { publishCourseAction } from "../../actions";
import { CourseTaxonomyForm } from "./taxonomy-form";

export const metadata = { title: "Course | Admin" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string }> };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-graphite">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

/** One course for an admin: who teaches it, where it stands, and how the catalog files it. */
export default async function AdminCoursePage({ params }: Params) {
  await requireRole("ADMIN");
  const { courseId } = await params;
  const [course, taxonomy, current] = await Promise.all([
    getAdminCourse(courseId),
    listTaxonomy(),
    getCourseTaxonomy(courseId),
  ]);
  if (!course || !current) notFound();
  const published = course.status === "PUBLISHED";

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        back={{ href: "/admin/courses" as Route, label: "Courses" }}
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

      <Panel
        title="Overview"
        actions={
          <form action={publishCourseAction}>
            <input type="hidden" name="courseId" value={course.id} />
            <input type="hidden" name="publish" value={published ? "false" : "true"} />
            {published ? (
              <ConfirmSubmit label="Unpublish" question="Take it off the catalog?" confirmLabel="Yes, unpublish" variant="secondary" />
            ) : (
              <Button type="submit" size="sm" variant="secondary">
                Publish
              </Button>
            )}
          </form>
        }
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Instructor">
            {course.instructor.name}
            <span className="block text-sm break-all text-graphite">{course.instructor.email}</span>
          </Fact>
          <Fact label="Learners">{course.enrollmentCount}</Fact>
          <Fact label="Created">
            <time dateTime={course.createdAt.toISOString()}>{formatDateMedium(course.createdAt)}</time>
          </Fact>
          <Fact label="Published">
            {course.publishedAt ? (
              <time dateTime={course.publishedAt.toISOString()}>{formatDateMedium(course.publishedAt)}</time>
            ) : (
              "Not yet"
            )}
          </Fact>
        </dl>
      </Panel>

      <Panel title="Taxonomy" description="Where the catalog files this course, and the topics and skills its page lists.">
        <CourseTaxonomyForm
          courseId={course.id}
          subjects={taxonomy.categories.map((subject) => ({
            id: subject.id,
            name: subject.name,
            children: subject.children.map((child) => ({ id: child.id, name: child.name })),
          }))}
          topics={taxonomy.topics.map((topic) => ({ id: topic.id, name: topic.name }))}
          skills={taxonomy.skills.map((skill) => ({ id: skill.id, name: skill.name }))}
          current={{
            categoryId: current.primaryCategoryId,
            topicIds: current.topics.map((row) => row.topicId),
            skillIds: current.skills.map((row) => row.skillId),
          }}
        />
      </Panel>
    </main>
  );
}
