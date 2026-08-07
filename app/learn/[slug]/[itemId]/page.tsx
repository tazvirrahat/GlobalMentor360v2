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
  getPlayerCourse,
  type PlayerItem,
} from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { completeLectureAction } from "../actions";
import { QuizForm } from "../quiz-form";
import { VideoPlayer } from "../video-player";

type Params = { params: Promise<{ slug: string; itemId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Learning · ${slug}` };
}

export const dynamic = "force-dynamic";

function ItemIcon({ item }: { item: PlayerItem }) {
  if (item.locked) return <Lock className="size-4 text-muted-foreground" aria-hidden />;
  if (item.completed) return <CheckCircle2 className="size-4 text-brand" aria-hidden />;
  if (item.type === "QUIZ") return <FileQuestion className="size-4 text-brand" aria-hidden />;
  return <PlayCircle className="size-4 text-brand" aria-hidden />;
}

export default async function LearnItemPage({ params }: Params) {
  const { slug, itemId } = await params;
  const user = await requireUser(`/learn/${slug}/${itemId}`);
  const course = await getPlayerCourse(slug, user.id);
  if (!course) notFound();

  const flat = course.sections.flatMap((section) => section.items);
  const current = flat.find((item) => item.id === itemId);
  if (!current) notFound();

  // Preview items are playable without enrollment; everything else needs it.
  if (!course.enrolled && !current.isPreview) {
    redirect(`/courses/${slug}` as Route);
  }

  if (!(await canAccessPlayerItem(user.id, course, itemId))) {
    // Locked by sequential gating — bounce to the course index which finds the
    // first unlocked item.
    redirect(`/learn/${slug}` as Route);
  }

  const currentIndex = flat.findIndex((item) => item.id === itemId);
  const next = flat.slice(currentIndex + 1).find((item) => !item.locked);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_300px] sm:px-6">
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <Link
            href={`/courses/${course.slug}` as Route}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {course.title}
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{current.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{current.type}</Badge>
            {current.isPreview ? (
              <Badge variant="outline" className="text-brand">
                Preview
              </Badge>
            ) : null}
            {current.completed ? <Badge className="bg-brand">Completed</Badge> : null}
          </div>
        </div>

        {course.percent >= 100 && course.certificateSerial ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-hero-gradient p-5 text-white">
            <div>
              <p className="font-extrabold">Course complete</p>
              <p className="text-sm text-white/80">Your certificate is ready.</p>
            </div>
            <Button asChild variant="secondary">
              <Link href={`/certificates/${course.certificateSerial}` as Route}>
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
              durationSeconds={current.lecture.durationSeconds}
              startAt={current.progress?.lastPositionSeconds ?? 0}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground">
              Video is processing — check back shortly.
            </div>
          )
        ) : null}

        {current.lecture?.contentType === "ARTICLE" ? (
          <article className="prose prose-neutral max-w-none rounded-2xl border p-6">
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {current.lecture.articleBody ?? "No article content yet."}
            </p>
          </article>
        ) : null}

        {current.lecture && course.enrolled && !current.completed ? (
          <form action={completeLectureAction}>
            <input type="hidden" name="itemId" value={current.id} />
            <input type="hidden" name="slug" value={course.slug} />
            <Button type="submit" className="shadow-brand">
              Mark complete{next ? " and continue" : ""}
              {next ? <ChevronRight className="size-4" aria-hidden /> : null}
            </Button>
          </form>
        ) : null}

        {current.assessment ? (
          <QuizForm
            assessmentId={current.assessment.id}
            slug={course.slug}
            questions={current.assessment.questions}
            allowRetakes={current.assessment.allowRetakes}
            previous={current.assessment.latestAttempt}
          />
        ) : null}

        {current.completed && next ? (
          <Button asChild variant="outline" className="w-fit">
            <Link href={`/learn/${course.slug}/${next.id}` as Route}>
              Next: {next.title} <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>

      <aside className="h-fit lg:sticky lg:top-20">
        <div className="rounded-2xl border p-4">
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Your progress</span>
              <span className="tabular-nums text-muted-foreground">{course.percent}%</span>
            </div>
            <Progress value={course.percent} className="mt-2" />
          </div>

          <nav className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            {course.sections.map((section) => (
              <div key={section.id}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </p>
                <ul className="flex flex-col">
                  {section.items.map((item) => {
                    const active = item.id === current.id;
                    const href = `/learn/${course.slug}/${item.id}` as Route;
                    const content = (
                      <span className="flex items-start gap-2 text-sm">
                        <ItemIcon item={item} />
                        <span className={active ? "font-semibold text-brand" : undefined}>
                          {item.title}
                        </span>
                      </span>
                    );

                    return (
                      <li key={item.id}>
                        {item.locked ? (
                          <span className="flex cursor-not-allowed rounded-md px-2 py-1.5 opacity-50">
                            {content}
                          </span>
                        ) : (
                          <Link
                            href={href}
                            className={`flex rounded-md px-2 py-1.5 hover:bg-accent ${
                              active ? "bg-accent" : ""
                            }`}
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
