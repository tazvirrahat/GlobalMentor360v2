import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronRight, Download } from "lucide-react";
import { Certificate } from "@/components/course/certificate";
import { LearnShell } from "@/components/learn/learn-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLearnerAnnouncements } from "@/lib/announcements";
import { getCertificateBySerial } from "@/lib/certificates";
import { db } from "@/lib/db";
import { isBookmarked, listNotes } from "@/lib/notes";
import { pickTab, type PlayerTab } from "@/lib/player";
import {
  canAccessPlayerItem,
  continueTargetId,
  getPlayerCourse,
  sequentialItemFromPlayer,
} from "@/lib/progress";
import { EMPTY_QA_PANEL, getCourseQaPanel } from "@/lib/qa";
import { getCurrentUser, requireUser } from "@/lib/session";
import { getSite } from "@/lib/site";
import { AnnouncementsPanel } from "../announcements-panel";
import { CompleteLectureForm } from "../complete-lecture-form";
import { BookmarkButton, NotesPanel } from "../notes-panel";
import { PlayerTabs, type PlayerTabSpec } from "../player-tabs";
import { QaPanel } from "../qa-panel";
import { QuizForm } from "../quiz-form";
import { VideoPlayer } from "../video-player";

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

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** `code` spans are things to type exactly, so they get the monospace. */
function withCode(text: string) {
  return text.split(/(`[^`\n]+`)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={index} className="rounded-sm bg-wash px-1 font-mono text-[0.9em] text-ink">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

/** Article text as paragraphs: blank lines split them, single newlines stay. */
function Article({ body }: { body: string }) {
  const paragraphs = body.split(/\n\s*\n/).filter((part) => part.trim());
  return (
    <article className="flex max-w-[68ch] flex-col gap-4 text-lg leading-[1.7] text-ink">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {withCode(paragraph.trim())}
        </p>
      ))}
    </article>
  );
}

/**
 * The player (spec §5): the lesson first, one row of actions under it, then
 * Overview / Q&A / Notes / Announcements as tabs. The shell (top bar, rail,
 * contents sheet) is LearnShell.
 */
export default async function LearnItemPage({ params, searchParams }: Params) {
  const { slug, itemId } = await params;
  const query = await searchParams;
  // Not requireUser: free preview lectures are playable logged out, and this is
  // the only route that renders a player. Sign-in is demanded below, once we
  // know the item is not a preview.
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
    // Locked by sequential gating: the course index finds the first open item.
    // A signed-out visitor has no index to land on, so send them to the landing.
    redirect((user ? `/learn/${slug}` : `/courses/${slug}`) as Route);
  }

  const enrolled = Boolean(user && course.enrolled);
  const qaPage = first(query.qaPage);
  const [announcements, notesPage, bookmarked, qaPanel, certificate] = await Promise.all([
    // getLearnerAnnouncements and getCourseQaPanel re-check the enrollment
    // themselves; these conditions are cost guards, not the access guard.
    enrolled ? getLearnerAnnouncements(user!.id, course.id) : Promise.resolve([]),
    enrolled && current.lecture
      ? listNotes(user!.id, current.lecture.id)
      : Promise.resolve({ notes: [], hiddenByPageSize: 0 }),
    enrolled ? isBookmarked(user!.id, current.id) : Promise.resolve(false),
    enrolled ? getCourseQaPanel(course.id, current.id, user!.id, qaPage) : Promise.resolve(EMPTY_QA_PANEL),
    course.percent >= 100 && course.certificateSerial
      ? getCertificateBySerial(course.certificateSerial)
      : Promise.resolve(null),
  ]);

  const nextId = continueTargetId(flat.map(sequentialItemFromPlayer), itemId);
  const next = nextId ? (flat.find((item) => item.id === nextId) ?? null) : null;
  const nextHref = next ? (`/learn/${course.slug}/${next.id}` as Route) : null;
  const openNext = next && !next.locked ? { href: `/learn/${course.slug}/${next.id}`, title: next.title } : null;

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
      contentType: item.lecture?.contentType ?? null,
      durationSeconds: item.lecture?.durationSeconds || null,
    })),
  }));
  const section = course.sections.find((entry) => entry.items.some((item) => item.id === current.id));
  const sectionIndex = section ? course.sections.indexOf(section) : -1;

  const isQuiz = current.type === "QUIZ" || current.type === "PRACTICE_TEST";
  const typeLabel = isQuiz ? "Quiz" : current.lecture?.contentType === "VIDEO" ? "Video" : "Article";

  const qaParams = Object.fromEntries(
    Object.entries(query)
      .filter(([key]) => key !== "qaPage")
      .flatMap(([key, value]) => {
        const v = first(value);
        return v ? [[key, v]] : [];
      }),
  );

  // The tabs this learner has: Q&A and Notes for enrolled learners (Notes only
  // on a lecture), Announcements only when there are some.
  const tabs: PlayerTabSpec[] = [
    {
      value: "overview",
      label: "Overview",
      panel: (
        <div className="flex max-w-[68ch] flex-col gap-3">
          <h2 className="sr-only">Overview</h2>
          {current.lecture?.description ? (
            <p className="text-base whitespace-pre-line text-ink">{current.lecture.description}</p>
          ) : null}
          <p className="text-graphite">
            {section ? `Section ${sectionIndex + 1}: ${section.title}. ` : ""}
            Lesson {flat.indexOf(current) + 1} of {flat.length} in {course.title}.
          </p>
        </div>
      ),
    },
  ];
  if (enrolled) {
    tabs.push({
      value: "qa",
      label: "Q&A",
      count: qaPanel.total,
      panel: (
        <QaPanel
          courseId={course.id}
          curriculumItemId={current.id}
          lectureTitle={current.title}
          slug={course.slug}
          panel={qaPanel}
          params={qaParams}
        />
      ),
    });
    if (current.lecture) {
      tabs.push({
        value: "notes",
        label: "Notes",
        count: notesPage.notes.length + notesPage.hiddenByPageSize,
        panel: (
          <NotesPanel
            lectureId={current.lecture.id}
            itemId={current.id}
            slug={course.slug}
            notes={notesPage.notes}
            hiddenByPageSize={notesPage.hiddenByPageSize}
          />
        ),
      });
    }
    if (announcements.length > 0) {
      tabs.push({
        value: "announcements",
        label: "Announcements",
        count: announcements.length,
        panel: <AnnouncementsPanel announcements={announcements} />,
      });
    }
  }
  const initialTab: PlayerTab = pickTab(
    first(query.tab) ?? (qaPage ? "qa" : undefined),
    tabs.map((tab) => tab.value),
  );

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
        <h1 className="text-2xl font-semibold sm:text-3xl">{current.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{typeLabel}</Badge>
          {current.isPreview ? <Badge variant="outline">Preview</Badge> : null}
          {current.completed ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden />
              Completed
            </Badge>
          ) : null}
          {enrolled ? (
            <span className="ml-auto">
              <BookmarkButton itemId={current.id} slug={course.slug} bookmarked={bookmarked} />
            </span>
          ) : null}
        </div>
      </header>

      {certificate ? (
        <section
          aria-labelledby="finished-heading"
          className="grid items-center gap-6 rounded-lg border border-rule bg-surface p-5 sm:grid-cols-[1fr_minmax(0,18rem)]"
        >
          <div className="flex flex-col gap-3">
            <h2 id="finished-heading" className="text-xl font-semibold">
              You finished {course.title}
            </h2>
            <p className="text-graphite">Your certificate is ready. Share its link, or download it as a PDF.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg">
                <Link href={`/certificates/${certificate.serial}` as Route}>View certificate</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href={`/certificates/${certificate.serial}/pdf`}>
                  <Download aria-hidden /> Download PDF
                </a>
              </Button>
            </div>
          </div>
          <div className="pr-1.5 pb-1.5" aria-hidden>
            <Certificate
              size="card"
              siteName={getSite().name}
              recipient={certificate.user.name}
              course={certificate.course.title}
              issuedAt={certificate.issuedAt}
              serial={certificate.serial}
            />
          </div>
        </section>
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
          <div className="flex aspect-video items-center justify-center rounded-lg border border-rule bg-wash p-6 text-center text-graphite">
            This video is still being prepared. Check back in a few minutes.
          </div>
        )
      ) : null}

      {current.lecture?.contentType === "ARTICLE" ? (
        current.lecture.articleBody ? (
          <Article body={current.lecture.articleBody} />
        ) : (
          <p className="text-graphite">This lesson has no text yet.</p>
        )
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

      {/* One row of actions under the lesson. */}
      {current.lecture && enrolled && !current.completed ? (
        <CompleteLectureForm itemId={current.id} slug={course.slug} hasNext={Boolean(next)} />
      ) : current.completed && openNext ? (
        <div>
          <Button asChild size="lg" className="w-full sm:w-fit">
            <Link href={openNext.href as Route}>
              Next lesson <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
      ) : current.completed && !next && enrolled ? (
        <div>
          <Button asChild size="lg" variant="secondary" className="w-full sm:w-fit">
            <Link href="/dashboard">Back to My learning</Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-4 border-t border-rule pt-2">
        <PlayerTabs initial={initialTab} tabs={tabs} />
      </div>
    </LearnShell>
  );
}
