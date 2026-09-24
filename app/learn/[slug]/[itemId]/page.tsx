import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Award,
  CheckCircle2,
  ChevronRight,
  FileQuestion,
  Lock,
  PlayCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  canAccessPlayerItem,
  continueTargetId,
  getPlayerCourse,
  sequentialItemFromPlayer,
  type PlayerItem,
} from "@/lib/progress";
import { getLearnerAnnouncements } from "@/lib/announcements";
import { getCurrentUser, requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
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
  const { slug } = await params;
  return { title: `Learning · ${slug}` };
}

export const dynamic = "force-dynamic";

function itemTypeLabel(type: string) {
  if (type === "QUIZ") return "Quiz";
  if (type === "LECTURE") return "Lecture";
  return type;
}

function ItemIcon({ item }: { item: PlayerItem }) {
  if (item.locked) return <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
  if (item.completed) return <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />;
  if (item.type === "QUIZ") return <FileQuestion className="size-4 shrink-0 text-primary" aria-hidden />;
  return <PlayCircle className="size-4 shrink-0 text-primary" aria-hidden />;
}

function ItemStateLabel({ item, active }: { item: PlayerItem; active: boolean }) {
  if (item.locked) return <span className="text-xs text-muted-foreground">Locked</span>;
  if (item.completed) return <span className="text-xs text-muted-foreground">Done</span>;
  if (active) return <span className="text-xs text-muted-foreground">Current</span>;
  return null;
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

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_18.75rem] sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <Link
            href={`/courses/${course.slug}` as Route}
            className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {course.title}
          </Link>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
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
          </div>
          {course.enrolled ? (
            <BookmarkButton itemId={current.id} slug={course.slug} bookmarked={bookmarked} />
          ) : null}
        </header>

        {course.percent >= 100 && course.certificateSerial ? (
          <div className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                <Award className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-heading font-semibold tracking-tight">Course complete</p>
                <p className="text-sm text-muted-foreground">Your certificate is ready.</p>
              </div>
            </div>
            <Button asChild>
              <Link href={`/certificates/${course.certificateSerial}` as Route} className="cursor-pointer">
                <Award className="size-4" aria-hidden /> View certificate
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
      </div>

      <aside className="h-fit lg:sticky lg:top-20">
        <div className="rounded-lg border bg-card p-4 shadow-xs">
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Your progress</span>
              <span className="tabular-nums text-muted-foreground">{course.percent}%</span>
            </div>
            <Progress
              value={course.percent}
              className="mt-2"
              aria-label={`Course progress ${course.percent}%`}
            />
          </div>

          <nav aria-label="Curriculum" className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            {course.sections.map((section) => (
              <div key={section.id}>
                <p className="mb-1 text-sm font-semibold text-ink">
                  {section.title}
                </p>
                <ul className="flex flex-col">
                  {section.items.map((item) => {
                    const active = item.id === current.id;
                    const href = `/learn/${course.slug}/${item.id}` as Route;
                    const content = (
                      <span className="flex min-w-0 items-start gap-2 text-sm">
                        <ItemIcon item={item} />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn("block truncate", active && "font-semibold")}
                            title={item.title}
                          >
                            {item.title}
                          </span>
                          <ItemStateLabel item={item} active={active} />
                        </span>
                      </span>
                    );

                    return (
                      <li key={item.id}>
                        {item.locked ? (
                          <span className="flex min-h-11 cursor-not-allowed items-center rounded-md px-2 py-1.5 opacity-60">
                            {content}
                          </span>
                        ) : (
                          <Link
                            href={href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-11 cursor-pointer items-center rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-muted/70 focus-ring",
                              active && "bg-muted",
                            )}
                          >
                            {content}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>
    </main>
  );
}
