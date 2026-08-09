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
import { RatingHistogram } from "@/components/site/rating-histogram";
import { ReviewList } from "@/components/site/review-list";
import { CompactRating, StarRating } from "@/components/site/star-rating";
import { isEnrolled } from "@/lib/entitlement";
import { formatPrice, getPublishedCourseBySlug } from "@/lib/courses";
import { getCourseReviewPanel } from "@/lib/reviews";
import { getCurrentUser } from "@/lib/session";
import { enrollFree } from "./enroll-free-action";
import { ReviewForm } from "./review-form";

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

  // Same rule as canPlayItem (lib/entitlement.ts): preview items play for
  // anyone, everything else needs a live enrollment. Calling it per item meant
  // one findUnique per lesson, sequentially, on a public SEO page — 60 round
  // trips for a 60-lesson course. `isPreview` and the enrollment are already in
  // hand, so the answer costs nothing.
  const playable = new Set(
    course.sections
      .flatMap((section) => section.items)
      .filter((item) => item.isPreview || enrolled)
      .map((item) => item.id),
  );

  // Three queries whatever the review count, fetched alongside nothing else the
  // page needs — the N+1 the playable set above was fixed to remove came from
  // the same instinct, one round trip per rendered row.
  const { summary, reviews, ownReview, hiddenByPageSize } = await getCourseReviewPanel(
    course.id,
    user?.id ?? null,
  );

  const free = course.isFree;
  const purchasable = course.price !== null;

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
              {/* `summary`, not course.ratingAverage. This page renders the
                  histogram computed from the rows a few sections down, so the
                  denormalised copy up here is a second answer to the same
                  question — and it is the answer that goes stale, because
                  nothing rewrites it when a cascaded User delete removes reviews
                  or a moderator hides one. The panel query is already paid for,
                  so the true number costs nothing extra here. The copy stays
                  authoritative on the catalog card, which cannot afford a query
                  per card; being one moderation action behind is invisible
                  there and self-contradictory here. */}
              {summary.count > 0 ? (
                <CompactRating
                  average={summary.average}
                  count={summary.count}
                  showRatingsWord
                  className="text-amber-300"
                  countClassName="text-white/60"
                />
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
                {free
                  ? "Free"
                  : course.price
                    ? formatPrice(course.price.amount, course.price.currency)
                    : "Not for sale"}
              </p>

              {enrolled ? (
                <Button asChild size="lg" className="shadow-brand">
                  <Link href={`/learn/${course.slug}` as Route}>
                    Continue learning <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              ) : free ? (
                // Offered only when enrollFree would actually accept it — the
                // action requires every active price to be 0, and a button that
                // silently does nothing is worse than no button.
                <form action={enrollFree}>
                  <input type="hidden" name="courseId" value={course.id} />
                  <Button type="submit" size="lg" className="w-full shadow-brand">
                    Enrol for free
                  </Button>
                </form>
              ) : purchasable ? (
                <Button asChild size="lg" className="shadow-brand">
                  <Link href={`/courses/${course.slug}/checkout`}>Buy this course</Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This course has no price set, so it can&rsquo;t be bought right now. Check back
                  soon.
                </p>
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

          {/* Reviews */}
          <section id="reviews" className="flex flex-col gap-6">
            <h2 className="text-2xl font-extrabold tracking-tight">Learner reviews</h2>

            {summary.count > 0 ? (
              <div className="grid items-center gap-6 rounded-xl border p-5 sm:grid-cols-[auto_1fr]">
                <div className="flex flex-col items-center gap-1 sm:pr-6">
                  <span className="text-4xl font-extrabold tabular-nums text-amber-600">
                    {summary.average.toFixed(1)}
                  </span>
                  <StarRating value={summary.average} />
                  <span className="text-xs text-muted-foreground">
                    {summary.count} {summary.count === 1 ? "rating" : "ratings"}
                  </span>
                </div>
                <RatingHistogram distribution={summary.distribution} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No ratings yet — enrolled learners can be the first to review this course.
              </p>
            )}

            {/* Rendering the form is a convenience, not the authorisation:
                submitReview re-checks the enrollment server-side (invariant 4). */}
            {enrolled ? (
              // ownReview.status goes through as-is. A hidden review is still
              // returned by getCourseReviewPanel but is filtered out of
              // `reviews`, so dropping the status here is what produced a form
              // that says "your review is live" above a list the learner cannot
              // find themselves in.
              <ReviewForm courseId={course.id} existing={ownReview} />
            ) : null}

            <ReviewList reviews={reviews} />

            {hiddenByPageSize > 0 ? (
              <p className="text-sm text-muted-foreground">
                Showing the {reviews.length} most recent reviews of {summary.count}.
              </p>
            ) : null}
          </section>
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
