import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link
        href={`/studio/courses/${course.id}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> {course.title}
      </Link>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Curriculum</h1>
      <p className="mt-1 text-muted-foreground">
        {course.sections.length} sections · {itemCount} lectures
      </p>

      <div className="mt-8">
        <SectionList courseId={course.id} sections={course.sections} />
      </div>

      <Card className="mt-8 rounded-2xl">
        <CardHeader>
          <CardTitle>Add a section</CardTitle>
        </CardHeader>
        <CardContent>
          <AddSectionForm courseId={course.id} />
        </CardContent>
      </Card>
    </main>
  );
}
