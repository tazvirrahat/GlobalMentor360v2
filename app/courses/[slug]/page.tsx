import type { Metadata, Route } from "next";
import Link from "next/link";
import { cache, type ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  FileQuestion,
  Globe,
  Lock,
  MessageSquare,
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
import { Reveal } from "@/components/site/reveal";
import { ReviewList } from "@/components/site/review-list";
import { CompactRating, StarRating } from "@/components/site/star-rating";
import { isEnrolled } from "@/lib/entitlement";
import { getPublishedCourseBySlug } from "@/lib/courses";
import { courseLevelLabel, coursePriceLabel } from "@/lib/labels";
import { getPlayerLockedItemIds } from "@/lib/progress";
import { getCourseReviewPanel, REVIEW_PAGE_SIZE } from "@/lib/reviews";
import { showingRange } from "@/lib/pagination";
import { getCurrentUser } from "@/lib/session";
import { enrollFree } from "./enroll-free-action";
import { ReviewForm } from "./review-form";
import { addCourseToCart } from "@/app/cart/actions";
import { PageNav } from "@/components/site/page-nav";

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const getCourse = cache(getPublishedCourseBySlug);

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function preservedSearchParams(
  params: Record<string, string | string[] | undefined>,
  omit: string,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === omit) continue;
    const next = firstParam(value);
    if (next) out[key] = next;
  }
  return out;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();

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

function instructorInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0] ?? "").join("").toUpperCase() || "?";
}

export default async function CourseLandingPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const query = await searchParams;
  const course = await getCourse(slug);

  if (!course) notFound();

  // Signed-out visitors see the page; entitlement decides only what is playable.
  const user = await getCurrentUser();
  const enrolled = user ? await isEnrolled(user.id, course.id) : false;

  // Same rule as the player: preview items are always linked; enrolled learners
  // only get /learn links for items sequential unlock has actually opened.
  const lockedIds =
    enrolled && user ? await getPlayerLockedItemIds(user.id, course.id) : new Set<string>();
  const playable = new Set(
    course.sections
      .flatMap((section) => section.items)
      .filter((item) => {
        if (item.isPreview) return true;
        if (!enrolled) return false;
        return !lockedIds.has(item.id);
      })
      .map((item) => item.id),
  );

  // Three queries whatever the review count, fetched alongside nothing else the
  // page needs — the N+1 the playable set above was fixed to remove came from
  // the same instinct, one round trip per rendered row.
  const { summary, reviews, ownReview, page: reviewPage, pageCount: reviewPageCount } =
    await getCourseReviewPanel(course.id, user?.id ?? null, firstParam(query.reviewPage));
  const reviewRange = showingRange(reviewPage, REVIEW_PAGE_SIZE, summary.count);

  const free = course.isFree;
  const purchasable = course.price !== null;
  const firstPreview = course.sections
    .flatMap((section) => section.items)
    .find((item) => item.isPreview);
  const previewSectionIds = course.sections
    .filter((section) => section.items.some((item) => item.isPreview))
    .map((section) => section.id);

  const purchase = (
    <PurchasePanel
      course={course}
      enrolled={enrolled}
      free={free}
      purchasable={purchasable}
      firstPreview={firstPreview}
      signedIn={Boolean(user)}
    />
  );

  return (
    <main>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[1fr_20rem] lg:items-start lg:px-8">
        <header className="min-w-0">
          <Reveal lcpSafe className="flex min-w-0 flex-col gap-4">
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                <li>
                  <Link
                    href="/courses"
                    className="cursor-pointer hover:text-foreground hover:underline"
                  >
                    Courses
                  </Link>
                </li>
                <li>
                  <ChevronRight className="size-3.5" aria-hidden />
                </li>
                <li className="min-w-0 truncate text-foreground" aria-current="page">
                  {course.title}
                </li>
              </ol>
            </nav>

            {course.primaryCategory ? (
              <Badge variant="secondary" className="w-fit">
                {course.primaryCategory.name}
              </Badge>
            ) : null}

            <h1 className="max-w-3xl font-heading text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
              {course.title}
            </h1>
            {course.subtitle ? (
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                {course.subtitle}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
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
                  className="text-star"
                  countClassName="text-muted-foreground"
                />
              ) : (
                <span>No ratings yet</span>
              )}
              <span className="flex items-center gap-1">
                <Users className="size-4" aria-hidden />
                {course.enrollmentCount} enrolled
              </span>
              <span>{courseLevelLabel(course.level)}</span>
              <span className="flex items-center gap-1">
                <Globe className="size-4" aria-hidden />
                {course.language}
              </span>
            </div>

            <p className="text-sm text-muted-foreground">Created by {course.instructor.name}</p>
          </Reveal>
        </header>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:row-span-2">
          {purchase}
          <InstructorCard course={course} />
        </aside>

        <div className="flex min-w-0 flex-col gap-10">
          {course.objectives.length > 0 ? (
            <Reveal>
              <section>
                <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                  What you&rsquo;ll learn
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {course.objectives.map((objective, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm leading-relaxed">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Check className="size-3" aria-hidden />
                      </span>
                      {objective.text}
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          ) : null}

          <section>
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Course content
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.sections.length} sections · {course.itemCount} items · {course.totalDuration}
            </p>

            {course.sections.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-6 py-12 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <BookOpen className="size-6" aria-hidden />
                </span>
                <p className="font-heading font-semibold tracking-tight">No lessons published yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Curriculum appears here when the instructor adds sections.
                </p>
              </div>
            ) : (
              <Accordion
                type="multiple"
                defaultValue={previewSectionIds}
                className="mt-4 rounded-lg border bg-card shadow-sm"
              >
                {course.sections.map((section) => (
                  <AccordionItem key={section.id} value={section.id} className="px-4">
                    <AccordionTrigger className="cursor-pointer hover:no-underline">
                      <span className="flex w-full min-w-0 items-center justify-between gap-2 pr-2 text-left">
                        <span className="min-w-0 truncate font-heading font-semibold">
                          {section.title}
                        </span>
                        <span className="shrink-0 text-xs font-normal text-muted-foreground">
                          {section.items.length} items · {section.duration}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="flex flex-col gap-1 pb-1">
                        {section.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-sm"
                          >
                            {playable.has(item.id) ? (
                              <Link
                                href={`/learn/${course.slug}/${item.id}` as Route}
                                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 hover:text-primary"
                              >
                                <PlayCircle className="size-4 shrink-0 text-primary" aria-hidden />
                                <span className="truncate">{item.title}</span>
                              </Link>
                            ) : item.type === "QUIZ" ? (
                              <>
                                <FileQuestion
                                  className="size-4 shrink-0 text-muted-foreground"
                                  aria-hidden
                                />
                                <span className="min-w-0 truncate">{item.title}</span>
                                <span className="text-xs text-muted-foreground">Locked</span>
                              </>
                            ) : (
                              <>
                                <Lock
                                  className="size-4 shrink-0 text-muted-foreground"
                                  aria-hidden
                                />
                                <span className="min-w-0 truncate">{item.title}</span>
                                <span className="text-xs text-muted-foreground">Locked</span>
                              </>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {ITEM_LABEL[item.type] ?? item.type}
                            </span>
                            {item.isPreview ? (
                              <Badge variant="outline" className="text-primary">
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
            )}
          </section>

          {course.requirements.length > 0 ? (
            <section>
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                Requirements
              </h2>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {course.requirements.map((requirement, index) => (
                  <li key={index}>{requirement.text}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {course.description ? (
            <section>
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                Description
              </h2>
              <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {course.description}
              </p>
            </section>
          ) : null}

          {course.targetAudience.length > 0 ? (
            <section>
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                Who this course is for
              </h2>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {course.targetAudience.map((audience, index) => (
                  <li key={index}>{audience.text}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section id="reviews" className="flex flex-col gap-6">
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Learner reviews
            </h2>

            <div className="grid items-center gap-6 rounded-lg border bg-card p-5 shadow-sm sm:grid-cols-[auto_1fr] sm:p-6">
              <div className="flex flex-col items-center gap-1 sm:pr-6">
                <span className="font-heading text-4xl font-semibold tabular-nums text-star">
                  {summary.average.toFixed(1)}
                </span>
                <StarRating value={summary.average} />
                <span className="text-xs text-muted-foreground">
                  {summary.count} {summary.count === 1 ? "rating" : "ratings"}
                </span>
              </div>
              <RatingHistogram distribution={summary.distribution} />
            </div>

            {summary.count === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-6 py-10 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageSquare className="size-6" aria-hidden />
                </span>
                <p className="text-sm text-muted-foreground">
                  No ratings yet — enrolled learners can be the first to review this course.
                </p>
              </div>
            ) : null}

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

            {summary.count > 0 ? (
              <p className="text-sm tabular-nums text-muted-foreground">
                Showing {reviewRange.from}–{reviewRange.to} of {summary.count}
              </p>
            ) : null}
            <PageNav
              pathname={`/courses/${course.slug}`}
              params={preservedSearchParams(query, "reviewPage")}
              page={reviewPage}
              pageCount={reviewPageCount}
              pageParam="reviewPage"
            />
          </section>
        </div>
      </div>
    </main>
  );
}

function PurchasePanel({
  course,
  enrolled,
  free,
  purchasable,
  firstPreview,
  signedIn,
}: {
  course: NonNullable<Awaited<ReturnType<typeof getCourse>>>;
  enrolled: boolean;
  free: boolean;
  purchasable: boolean;
  firstPreview:
    | NonNullable<Awaited<ReturnType<typeof getCourse>>>["sections"][number]["items"][number]
    | undefined;
  signedIn: boolean;
}) {
  return (
    <Card className="h-fit">
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <p className="font-heading text-3xl font-semibold tabular-nums text-primary">
          {coursePriceLabel(free, course.price)}
        </p>

        <div className="flex flex-col gap-2">
          {enrolled ? (
            <Button asChild size="lg">
              <Link href={`/learn/${course.slug}` as Route} className="cursor-pointer">
                Continue learning <ChevronRight className="size-4" aria-hidden />
              </Link>
            </Button>
          ) : (
            <>
              {firstPreview ? (
                <Button asChild size="lg" variant={free || purchasable ? "outline" : "default"}>
                  <Link
                    href={`/learn/${course.slug}/${firstPreview.id}` as Route}
                    className="cursor-pointer"
                  >
                    Preview: {firstPreview.title}
                  </Link>
                </Button>
              ) : null}
              {free ? (
                // Offered only when enrollFree would actually accept it — the
                // action requires every active price to be 0, and a button that
                // silently does nothing is worse than no button.
                <form action={enrollFree}>
                  <input type="hidden" name="courseId" value={course.id} />
                  <Button type="submit" size="lg" variant="cta" className="w-full">
                    Enrol for free
                  </Button>
                </form>
              ) : purchasable ? (
                <>
                  <Button asChild size="lg" variant="cta">
                    <Link href={`/courses/${course.slug}/checkout`} className="cursor-pointer">
                      Buy this course
                    </Link>
                  </Button>
                  {signedIn ? (
                    <form action={addCourseToCart}>
                      <input type="hidden" name="courseId" value={course.id} />
                      <input type="hidden" name="slug" value={course.slug} />
                      <Button type="submit" variant="outline" size="lg" className="w-full">
                        Add to cart
                      </Button>
                    </form>
                  ) : (
                    <Button asChild variant="outline" size="lg">
                      <Link
                        href={`/sign-in?next=${encodeURIComponent(`/courses/${course.slug}`)}`}
                        className="cursor-pointer"
                      >
                        Sign in to add to cart
                      </Link>
                    </Button>
                  )}
                </>
              ) : firstPreview ? null : (
                <p className="text-sm text-muted-foreground">
                  This course has no price set, so it can&rsquo;t be bought right now. Check back
                  soon.
                </p>
              )}
            </>
          )}
        </div>

        <ul className="flex flex-col gap-2.5 text-sm text-muted-foreground">
          <IncludeRow icon={<BookOpen className="size-4" aria-hidden />}>
            {course.itemCount} lessons across {course.sections.length} sections
          </IncludeRow>
          <IncludeRow icon={<Clock className="size-4" aria-hidden />}>
            {course.totalDuration} of content
          </IncludeRow>
          <IncludeRow icon={<Check className="size-4" aria-hidden />}>Lifetime access</IncludeRow>
        </ul>
      </CardContent>
    </Card>
  );
}

function IncludeRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      {children}
    </li>
  );
}

function InstructorCard({
  course,
}: {
  course: NonNullable<Awaited<ReturnType<typeof getCourse>>>;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Instructor
        </h2>
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-sm font-semibold"
            aria-hidden
          >
            {instructorInitials(course.instructor.name)}
          </span>
          <p className="font-heading text-lg font-semibold tracking-tight">
            {course.instructor.name}
          </p>
        </div>
        {course.instructor.headline ? (
          <p className="text-sm text-muted-foreground">{course.instructor.headline}</p>
        ) : null}
        {course.instructor.bio ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{course.instructor.bio}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
