import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getOwnedCurriculum } from "@/lib/studio";
import { AddSectionForm, SectionList } from "./curriculum-editor";

export const metadata = { title: "Curriculum — Studio" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string }> };

export default async function CurriculumPage({ params }: Params) {
  const { courseId } = await params;
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const course = await getOwnedCurriculum(courseId, user.id);
  if (!course) notFound();

  const itemCount = course.sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <main>
      <p>
        <Link href={`/studio/courses/${course.id}`}>← {course.title}</Link>
      </p>

      <h1>Curriculum</h1>
      <p>
        {course.sections.length} sections · {itemCount} lectures
      </p>

      <SectionList sections={course.sections} />

      <section>
        <h2>Add a section</h2>
        <AddSectionForm courseId={course.id} />
      </section>
    </main>
  );
}
