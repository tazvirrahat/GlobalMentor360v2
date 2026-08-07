import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  FileQuestion,
  Globe,
  Lock,
  PlayCircle,
  Star,
  Users,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { canPlayItem, isEnrolled } from "@/lib/entitlement";
import { formatPrice, getPublishedCourseBySlug } from "@/lib/courses";
import { getCurrentUser } from "@/lib/session";
import { enrollFree } from "./enroll-free-action";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) return { title: "Not found" };

  return {
    title: course.title,
    description: course.subtitle ?? undefined,
  };
}

const ITEM_LABEL: Record<string, string> = {
  LECTURE: "Lecture",
  QUIZ: "Quiz",
  PRACTICE_TEST: "Practice test",
  ASSIGNMENT: "Assignment",
  CODING_EXERCISE: "Coding exercise",
};

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export default async function CourseLandingPage({ params }: Params) {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);

  if (!course) notFound();

  // Signed-out visitors see the page; entitlement decides only what is playable.
  const user = await getCurrentUser();
  const enrolled = user ? await isEnrolled(user.id, course.id) : false;

  const playable = new Set<string>();
  for (const section of course.sections) {
    for (const item of section.items) {
      const decision = await canPlayItem(user?.id ?? null, item.id);
      if (decision.allowed) playable.add(item.id);
    }
  }

  const free = !course.price || course.price.amount === 0;

  return (
    <main>
      {/* Hero band */}
      <section className="bg-hero-gradient text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-4">
            {course.primaryCategory ? (
              <Badge className="w-fit bg-white/15 text-white">{course.primaryCategory.name}</Badge>
            ) : null}
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              {course.title}
            </h1>
            {course.subtitle ? <p className="text-lg text-white/80">{course.subtitle}</p> : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/80">
              {course.ratingCount > 0 ? (
                <span className="flex items-center gap-1 font-semibold text-amber-300">
                  <Star className="size-4 fill-current" aria-hidden />
                  {course.ratingAverage.toFixed(1)}
                  <span className="font-normal text-white/60">({course.ratingCount} ratings)</span>
                </span>
              ) : (
                <span>No ratings yet</span>
              )}
              <span className="flex items-center gap-1">
                <Users className="size-4" aria-hidden />
                {course.enrollmentCount} enrolled
              </span>
              <span>{LEVEL_LABEL[course.level] ?? course.level}</span>
              <span className="flex items-center gap-1">
                <Globe className="size-4" aria-hidden />
                {course.language}
              </span>
            </div>

            <p className="text-sm text-white/70">Created by {course.instructor.name}</p>
          </div>

          {/* Purchase card */}
          <Card className="h-fit rounded-2xl">
            <CardContent className="flex flex-col gap-4 p-6">
              <p className="text-3xl font-extrabold text-brand">
                {free ? "Free" : formatPrice(course.price!.amount, course.price!.currency)}
              </p>

              {enrolled ? (
                <Button asChild size="lg" className="shadow-brand">
                  <Link href={`/learn/${course.slug}` as Route}>
                    Continue learning <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              ) : free ? (
                <form action={enrollFree}>
                  <input type="hidden" name="courseId" value={course.id} />
                  <Button type="submit" size="lg" className="w-full shadow-brand">
                    Enrol for free
                  </Button>
                </form>
              ) : (
                <Button asChild size="lg" className="shadow-brand">
                  <Link href={`/courses/${course.slug}/checkout`}>Buy this course</Link>
                </Button>
              )}

              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <BookOpen className="size-4 text-brand" aria-hidden />
                  {course.itemCount} lessons across {course.sections.length} sections
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="size-4 text-brand" aria-hidden />
                  {course.totalDuration} of content
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-brand" aria-hidden />
                  Lifetime access
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-10">
          {course.objectives.length > 0 ? (
            <section>
              <h2 className="text-2xl font-extrabold tracking-tight">What you&rsquo;ll learn</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {course.objectives.map((objective, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                    {objective.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="text-2xl font-extrabold tracking-tight">Course content</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.sections.length} sections · {course.itemCount} items · {course.totalDuration}
            </p>

            <Accordion type="multiple" className="mt-4 rounded-xl border">
              {course.sections.map((section) => (
                <AccordionItem key={section.id} value={section.id} className="px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <span className="flex w-full items-center justify-between gap-2 pr-2 text-left">
                      <span className="font-semibold">{section.title}</span>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {section.items.length} items · {section.duration}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="flex flex-col gap-2">
                      {section.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 text-sm">
                          {playable.has(item.id) ? (
                            <PlayCircle className="size-4 shrink-0 text-brand" aria-hidden />
                          ) : item.type === "QUIZ" ? (
                            <FileQuestion className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          ) : (
                            <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          )}
                          <span>{item.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {ITEM_LABEL[item.type] ?? item.type}
                          </span>
                          {item.isPreview ? (
                            <Badge variant="outline" className="text-brand">
                              Preview
                            </Badge>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          {course.requirements.length > 0 ? (
            <section>
              <h2 className="text-2xl font-extrabold tracking-tight">Requirements</h2>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
                {course.requirements.map((requirement, index) => (
                  <li key={index}>{requirement.text}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {course.description ? (
            <section>
              <h2 className="text-2xl font-extrabold tracking-tight">Description</h2>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {course.description}
              </p>
            </section>
          ) : null}

          {course.targetAudience.length > 0 ? (
            <section>
              <h2 className="text-2xl font-extrabold tracking-tight">Who this course is for</h2>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
                {course.targetAudience.map((audience, index) => (
                  <li key={index}>{audience.text}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Instructor panel */}
        <aside className="h-fit">
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col gap-2 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Instructor
              </h2>
              <p className="text-lg font-bold">{course.instructor.name}</p>
              {course.instructor.headline ? (
                <p className="text-sm text-muted-foreground">{course.instructor.headline}</p>
              ) : null}
              {course.instructor.bio ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {course.instructor.bio}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
