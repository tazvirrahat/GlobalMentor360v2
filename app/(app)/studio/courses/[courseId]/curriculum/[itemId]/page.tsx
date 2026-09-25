import type { Route } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { isStorageConfigured } from "@/lib/storage";
import { getOwnedItemForEditing } from "@/lib/studio";
import { tryDrainMediaConvertEventQueue } from "@/lib/video";
import { LectureEditor } from "./lecture-editor";
import { CaptionUpload } from "./caption-upload";
import { QuizBuilder } from "./quiz-builder";
import { ResourcesPanel } from "./resources-panel";

export const metadata = { title: "Edit item | Studio" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string; itemId: string }> };

export default async function ItemEditorPage({ params }: Params) {
  const { courseId, itemId } = await params;
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  await tryDrainMediaConvertEventQueue();

  const item = await getOwnedItemForEditing(courseId, itemId, user.id);
  if (!item) notFound();

  const resources = item.lecture
    ? await db.lectureResource.findMany({
        where: { lectureId: item.lecture.id },
        orderBy: { id: "asc" },
        select: { id: true, filename: true, sizeBytes: true, externalUrl: true },
      })
    : [];

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        back={{ href: `/studio/courses/${courseId}/curriculum` as Route, label: "Curriculum" }}
        title={item.title}
        description={`${item.type === "QUIZ" ? "Quiz" : "Lecture"} in “${item.section.title}”`}
      />

      {item.type === "LECTURE" && item.lecture ? (
        <div className="flex flex-col gap-6">
          <LectureEditor itemId={item.id} title={item.title} lecture={item.lecture} />
          <ResourcesPanel itemId={item.id} resources={resources} storageReady={isStorageConfigured()} />
          {item.lecture.asset ? (
            <CaptionUpload itemId={item.id} captions={item.lecture.asset.captions} />
          ) : null}
        </div>
      ) : item.type === "QUIZ" && item.assessment ? (
        <QuizBuilder itemId={item.id} title={item.title} assessment={item.assessment} />
      ) : (
        // Reachable only for a row the studio cannot author: a PRACTICE_TEST or
        // ASSIGNMENT (no builder yet), or a typed item missing its detail row.
        <p className="text-graphite">
          This item type has no editor yet. Delete it from the curriculum if it was created by mistake.
        </p>
      )}
    </main>
  );
}
