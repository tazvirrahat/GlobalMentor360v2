import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Award, CheckCircle2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LearnShell } from "@/components/learn/learn-shell";
import {
  canAccessPlayerItem,
  continueTargetId,
  getPlayerCourse,
  sequentialItemFromPlayer,
} from "@/lib/progress";
import { db } from "@/lib/db";
import { getLearnerAnnouncements } from "@/lib/announcements";
import { getCurrentUser, requireUser } from "@/lib/session";
import { AnnouncementsPanel } from "../announcements-panel";
import { CompleteLectureForm } from "../complete-lecture-form";
import { BookmarkButton, NotesPanel } from "../notes-panel";
import { QaPanel } from "../qa-panel";
import { QuizForm } from "../quiz-form";
import { VideoPlayer } from "../video-player";
import { isBookmarked, listNotes } from "@/lib/notes";

type Params = {
  params: Promise<{ slug: string; itemId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, itemId } = await params;
  // Titles of published courses only: the page itself decides access, and a
  // draft's lesson names should not leak through the document title.
  const item = await db.curriculumItem.findFirst({
    where: { id: itemId, section: { course: { slug, status: "PUBLISHED" } } },
    select: { title: true, section: { select: { course: { select: { title: true } } } } },
  });
  return { title: item ? `${item.title} | ${item.section.course.title}` : "Lesson" };
}

export const dynamic = "force-dynamic";

function itemTypeLabel(type: string) {
  if (type === "QUIZ") return "Quiz";
  if (type === "LECTURE") return "Lecture";
  return type;
}

export default async function LearnItemPage({ params, searchParams }: Params) {
  const { slug, itemId } = await params;
  const query = await searchParams;
  // Not requireUser: free preview lectures are playable logged out, and this is
  // the only route that renders a player (docs/FEATURES.md section B). Sign-in is
  // demanded below, once we know the item is not a preview.
  const user = await getCurrentUser();
  const course = await getPlayerCourse(slug, user?.id ?? null, itemId);
  if (!course) notFound();

  const flat = course.sections.flatMap((section) => section.items);
  const current = flat.find((item) => item.id === itemId);
  if (!current) notFound();

  // Preview items are playable without enrollment; everything else needs an
  // account first, then an enrollment.
  if (!current.isPreview) {
    if (!user) await requireUser(`/learn/${slug}/${itemId}`);
    if (!course.enrolled) redirect(`/courses/${slug}` as Route);
  }

  if (!(await canAccessPlayerItem(user?.id ?? null, course, itemId))) {
    // Locked by sequential gating — bounce to the course index which finds the
    // first unlocked item. A signed-out visitor has no index to land on, so send
    // them to the landing page.
    redirect((user ? `/learn/${slug}` : `/courses/${slug}`) as Route);
  }

  // Only for enrolled learners: getLearnerAnnouncements re-checks the enrollment
  // itself, so this is a cost guard rather than the access guard.
  const announcements =
    user && course.enrolled ? await getLearnerAnnouncements(user.id, course.id) : [];

  const nextId = continueTargetId(flat.map(sequentialItemFromPlayer), itemId);
  const next = nextId ? (flat.find((item) => item.id === nextId) ?? null) : null;
  const nextHref = next ? (`/learn/${course.slug}/${next.id}` as Route) : null;

  const [notesPage, bookmarked] = await Promise.all([
    user && current.lecture && course.enrolled
      ? listNotes(user.id, current.lecture.id)
      : Promise.resolve({ notes: [], hiddenByPageSize: 0 }),
    user && course.enrolled ? isBookmarked(user.id, current.id) : Promise.resolve(false),
  ]);

  const sections = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    items: section.items.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      isPreview: item.isPreview,
      locked: item.locked,
      completed: item.completed,
      durationSeconds: item.lecture?.durationSeconds || null,
    })),
  }));
  const openNext = next && !next.locked ? { href: `/learn/${course.slug}/${next.id}`, title: next.title } : null;

  return (
    <LearnShell
      course={{
        title: course.title,
        slug: course.slug,
        enrolled: course.enrolled,
        percent: course.percent,
        done: flat.filter((item) => item.completed).length,
        total: flat.length,
        sections,
      }}
      currentId={current.id}
      next={openNext}
    >
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {current.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{itemTypeLabel(current.type)}</Badge>
            {current.isPreview ? <Badge variant="outline">Preview</Badge> : null}
            {current.completed ? (
              <Badge variant="success">
                <CheckCircle2 aria-hidden />
                Completed
              </Badge>
            ) : null}
            {course.enrolled ? (
              <BookmarkButton itemId={current.id} slug={course.slug} bookmarked={bookmarked} />
            ) : null}
          </div>
        </header>

        {course.percent >= 100 && course.certificateSerial ? (
          <div className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Award className="mt-0.5 size-5 shrink-0 text-verified" aria-hidden />
              <div>
                <p className="font-semibold">Course complete</p>
                <p className="text-sm text-graphite">Your certificate is ready.</p>
              </div>
            </div>
            <Button asChild>
              <Link href={`/certificates/${course.certificateSerial}` as Route} className="cursor-pointer">
                View certificate
              </Link>
            </Button>
          </div>
        ) : null}

        {current.lecture?.contentType === "VIDEO" ? (
          current.lecture.asset?.status === "READY" ? (
            <VideoPlayer
              itemId={current.id}
              slug={course.slug}
              startAt={current.progress?.lastPositionSeconds ?? 0}
              nextHref={nextHref}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
              Video is processing — check back shortly.
            </div>
          )
        ) : null}

        {current.lecture?.contentType === "ARTICLE" ? (
          <article className="rounded-lg border bg-card p-6 shadow-xs">
            <p className="whitespace-pre-line text-base leading-relaxed">
              {current.lecture.articleBody ?? "No article content yet."}
            </p>
          </article>
        ) : null}

        {current.lecture && course.enrolled && !current.completed ? (
          <CompleteLectureForm itemId={current.id} slug={course.slug} hasNext={Boolean(next)} />
        ) : null}

        {current.assessment ? (
          <QuizForm
            assessmentId={current.assessment.id}
            slug={course.slug}
            questions={current.assessment.questions}
            allowRetakes={current.assessment.allowRetakes}
            previous={current.assessment.latestAttempt}
            nextHref={nextHref}
          />
        ) : null}

        {current.completed && next ? (
          <Button asChild variant="outline" className="w-fit">
            <Link href={`/learn/${course.slug}/${next.id}` as Route} className="cursor-pointer">
              Next: {next.title} <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}

        {current.lecture && course.enrolled ? (
          <NotesPanel
            lectureId={current.lecture.id}
            itemId={current.id}
            slug={course.slug}
            notes={notesPage.notes}
            hiddenByPageSize={notesPage.hiddenByPageSize}
          />
        ) : null}

        {/* Q&A is for people taking the course, so it is absent on the preview
            path a signed-out visitor reaches this page through. Hiding it is not
            the guard — lib/qa.ts re-checks the enrollment on every write. */}
        {/* Above Q&A deliberately: an announcement is the instructor telling
            every learner something, and burying it under the thread list is how
            it goes unread. Empty renders nothing, so it costs no space. */}
        {course.enrolled ? <AnnouncementsPanel announcements={announcements} /> : null}

        {course.enrolled ? (
          <QaPanel
            courseId={course.id}
            curriculumItemId={current.id}
            lectureTitle={current.title}
            slug={course.slug}
            page={typeof query.qaPage === "string" ? query.qaPage : undefined}
            params={Object.fromEntries(
              Object.entries(query)
                .filter(([key]) => key !== "qaPage")
                .flatMap(([key, value]) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  return next ? [[key, next]] : [];
                }),
            )}
          />
        ) : null}
    </LearnShell>
  );
}
