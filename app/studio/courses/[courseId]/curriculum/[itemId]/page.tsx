import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/session";
import { getOwnedItemForEditing } from "@/lib/studio";
import { LectureEditor } from "./lecture-editor";
import { QuizBuilder } from "./quiz-builder";

export const metadata = { title: "Edit item — Studio" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string; itemId: string }> };

export default async function ItemEditorPage({ params }: Params) {
  const { courseId, itemId } = await params;
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  const item = await getOwnedItemForEditing(courseId, itemId, user.id);
  if (!item) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link
        href={`/studio/courses/${courseId}/curriculum`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Curriculum
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{item.title}</h1>
        <Badge variant="secondary">{item.type === "QUIZ" ? "Quiz" : "Lecture"}</Badge>
      </div>
      <p className="mt-1 text-muted-foreground">In “{item.section.title}”</p>

      <div className="mt-8">
        {item.type === "LECTURE" && item.lecture ? (
          <LectureEditor itemId={item.id} title={item.title} lecture={item.lecture} />
        ) : item.type === "QUIZ" && item.assessment ? (
          <QuizBuilder itemId={item.id} title={item.title} assessment={item.assessment} />
        ) : (
          // Reachable only for a row the studio cannot author: a PRACTICE_TEST or
          // ASSIGNMENT (no builder yet), or a typed item missing its detail row.
          <p className="text-muted-foreground">
            This item type has no editor yet. Delete it from the curriculum if it was created by
            mistake.
          </p>
        )}
      </div>
    </main>
  );
}
