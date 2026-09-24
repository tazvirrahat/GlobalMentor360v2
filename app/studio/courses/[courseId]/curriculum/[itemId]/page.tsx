import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/session";
import { getOwnedItemForEditing } from "@/lib/studio";
import { tryDrainMediaConvertEventQueue } from "@/lib/video";
import { LectureEditor } from "./lecture-editor";
import { CaptionUpload } from "./caption-upload";
import { QuizBuilder } from "./quiz-builder";

export const metadata = { title: "Edit item — Studio" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string; itemId: string }> };

export default async function ItemEditorPage({ params }: Params) {
  const { courseId, itemId } = await params;
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  await tryDrainMediaConvertEventQueue();

  const item = await getOwnedItemForEditing(courseId, itemId, user.id);
  if (!item) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={`/studio/courses/${courseId}/curriculum`}
        className="inline-flex w-fit cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Curriculum
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{item.title}</h1>
        <Badge variant="secondary">{item.type === "QUIZ" ? "Quiz" : "Lecture"}</Badge>
      </div>
      <p className="mt-1 text-muted-foreground">In “{item.section.title}”</p>

      <div className="mt-8">
        {item.type === "LECTURE" && item.lecture ? (
          <div className="flex flex-col gap-6">
            <LectureEditor itemId={item.id} title={item.title} lecture={item.lecture} />
            {item.lecture.asset ? (
              <CaptionUpload itemId={item.id} captions={item.lecture.asset.captions} />
            ) : null}
          </div>
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
