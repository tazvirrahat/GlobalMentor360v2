import type { Metadata, Route } from "next";
import Link from "next/link";
import { cache, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { Award, BookOpen, Check, ChevronDown, ChevronRight, Clock, FileQuestion, Infinity as InfinityIcon } from "lucide-react";
import { CodeText } from "@/components/course/code-text";
import { CourseModule } from "@/components/course/course-module";
import { CoursePrice } from "@/components/course/price";
import { PageNav } from "@/components/site/page-nav";
import { RatingHistogram } from "@/components/site/rating-histogram";
import { ReviewList } from "@/components/site/review-list";
import { StarRating } from "@/components/site/star-rating";
import { Button } from "@/components/ui/button";
import { addCourseToCart } from "@/app/(site)/cart/actions";
import { getPublishedCourseBySlug } from "@/lib/courses";
import { isEnrolled } from "@/lib/entitlement";
import { courseLevelLabel } from "@/lib/labels";
import { initials } from "@/lib/nav";
import { showingRange } from "@/lib/pagination";
import { getPlayerLockedItemIds } from "@/lib/progress";
import { getCourseReviewPanel, REVIEW_PAGE_SIZE } from "@/lib/reviews";
import { getCurrentUser } from "@/lib/session";
import { enrollFree } from "./enroll-free-action";
import { PurchaseBar } from "./purchase-bar";
import { ReviewForm } from "./review-form";

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type Course = NonNullable<Awaited<ReturnType<typeof getPublishedCourseBySlug>>>;

const getCourse = cache(getPublishedCourseBySlug);

const LANGUAGE = new Intl.DisplayNames(["en"], { type: "language" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const PANEL_ID = "purchase-panel";

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

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();

  const description = course.subtitle ?? course.description?.slice(0, 160) ?? undefined;
  return {
    title: course.title,
    description,
    openGraph: { type: "website", title: course.title, description },
  };
}

const LINK = "rounded-sm underline decoration-control underline-offset-4 hover:decoration-ink focus-ring";

/**
 * The course landing page (spec §6): what the course is, what it costs and how
 * to get it, what is in it, and what learners said.
 */
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
  const lockedIds = enrolled && user ? await getPlayerLockedItemIds(user.id, course.id) : new Set<string>();
  const items = course.sections.flatMap((section) => section.items);
  const playable = items
    .filter((item) => item.isPreview || (enrolled && !lockedIds.has(item.id)))
    .map((item) => item.id);

  // `summary`, not course.ratingAverage: this page renders the histogram from
  // the same rows, and the denormalised copy is the one that goes stale when a
  // review is hidden or a user is deleted.
  const { summary, reviews, ownReview, page: reviewPage, pageCount: reviewPageCount } = await getCourseReviewPanel(
    course.id,
    user?.id ?? null,
    firstParam(query.reviewPage),
  );
  const reviewRange = showingRange(reviewPage, REVIEW_PAGE_SIZE, summary.count);

  const firstPreview = items.find((item) => item.isPreview);
  const previewSectionIds = course.sections
    .filter((section) => section.items.some((item) => item.isPreview))
    .map((section) => section.id);
  const lectureCount = items.filter((item) => item.lecture).length;
  const quizCount = items.filter((item) => item.type === "QUIZ" || item.type === "PRACTICE_TEST").length;
  const languageName = LANGUAGE.of(course.language) ?? course.language;

  const primary = <PrimaryAction course={course} enrolled={enrolled} />;
  const instructorHref =
    course.instructor.slug && course.instructor.profilePublic
      ? (`/instructors/${course.instructor.slug}` as Route)
      : null;

  return (
    <main className="pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-8">
          <header className="flex min-w-0 flex-col gap-4 lg:col-start-1">
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1 text-sm text-graphite">
                <li>
                  <Link href="/courses" className={`${LINK} inline-flex min-h-6 items-center`}>
                    Courses
                  </Link>
                </li>
                {course.primaryCategory ? (
                  <>
                    <li aria-hidden>
                      <ChevronRight className="size-3.5" />
                    </li>
                    <li>
                      <Link
                        href={`/courses?category=${course.primaryCategory.slug}` as Route}
                        className={`${LINK} inline-flex min-h-6 items-center`}
                      >
                        {course.primaryCategory.name}
                      </Link>
                    </li>
                  </>
                ) : null}
              </ol>
            </nav>

            <h1 className="max-w-3xl text-3xl font-bold sm:text-4xl">{course.title}</h1>
            {course.subtitle ? <p className="max-w-2xl text-lg text-graphite">{course.subtitle}</p> : null}

            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink">
              <li>
                {summary.count > 0 ? (
                  <a href="#reviews" className="inline-flex min-h-6 items-center gap-1.5 rounded-sm hover:underline focus-ring">
                    <StarRating value={summary.average} starClassName="size-3.5" />
                    <span className="font-semibold">{summary.average.toFixed(1)}</span>
                    <span className="text-graphite">({plural(summary.count, "rating")})</span>
                  </a>
                ) : (
                  <span className="text-graphite">No ratings yet</span>
                )}
              </li>
              <li>{plural(course.enrollmentCount, "learner")}</li>
              <li>{courseLevelLabel(course.level)}</li>
              <li>{languageName}</li>
              <li className="text-graphite">Last updated {MONTH_YEAR.format(course.updatedAt)}</li>
            </ul>

            <p className="text-sm text-graphite">
              Created by{" "}
              {instructorHref ? (
                <Link
                  href={instructorHref}
                  className="rounded-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
                >
                  {course.instructor.name}
                </Link>
              ) : (
                <span className="font-medium text-ink">{course.instructor.name}</span>
              )}
            </p>
          </header>

          <aside
            id={PANEL_ID}
            aria-label="Get this course"
            className="flex h-fit flex-col gap-5 self-start rounded-lg border border-rule bg-surface p-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1"
          >
            <CoursePrice isFree={course.isFree} price={course.price} className="text-3xl" />
            <div className="flex flex-col gap-2">
              {primary}
              {!enrolled && !course.isFree && course.price ? (
                user ? (
                  <form action={addCourseToCart}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="slug" value={course.slug} />
                    <Button type="submit" variant="secondary" size="lg" className="w-full">
                      Add to cart
                    </Button>
                  </form>
                ) : (
                  <Button asChild variant="secondary" size="lg">
                    <Link href={`/sign-in?next=${encodeURIComponent(`/courses/${course.slug}`)}` as Route}>
                      Sign in to add to cart
                    </Link>
                  </Button>
                )
              ) : null}
              {!enrolled && firstPreview ? (
                <Link
                  href={`/learn/${course.slug}/${firstPreview.id}` as Route}
                  className={`${LINK} mt-1 inline-flex min-h-6 items-center self-center text-sm font-medium text-ink`}
                >
                  Watch free preview
                </Link>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 border-t border-rule pt-4">
              <h2 className="text-sm font-semibold">This course includes</h2>
              <ul className="flex flex-col gap-2.5 text-sm text-ink">
                <Include icon={<BookOpen />}>{plural(lectureCount, "lesson")}</Include>
                <Include icon={<Clock />}>{course.totalDuration} to watch and read</Include>
                {quizCount > 0 ? (
                  <Include icon={<FileQuestion />}>{plural(quizCount, "quiz", "quizzes")}</Include>
                ) : null}
                <Include icon={<Award />}>Certificate of completion</Include>
                <Include icon={<InfinityIcon />}>Lifetime access</Include>
              </ul>
            </div>
          </aside>

        <div className="flex min-w-0 flex-col gap-12 lg:col-start-1">
          {course.objectives.length > 0 ? (
            <section aria-labelledby="learn-heading" className="rounded-lg border border-rule bg-surface p-5 sm:p-6">
              <h2 id="learn-heading" className="text-2xl font-semibold">
                What you&rsquo;ll learn
              </h2>
              <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {course.objectives.map((objective, index) => (
                  <li key={index} className="flex items-start gap-3 text-base">
                    <Check className="mt-1 size-4 shrink-0 text-ink" strokeWidth={2} aria-hidden />
                    {objective.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="content-heading" className="flex flex-col gap-4">
            <div>
              <h2 id="content-heading" className="text-2xl font-semibold">
                Course content
              </h2>
              <p className="mt-1 text-sm text-graphite">
                {plural(course.sections.length, "section")}, {plural(lectureCount, "lesson")}
                {quizCount > 0 ? `, ${plural(quizCount, "quiz", "quizzes")}` : ""}, {course.totalDuration}
              </p>
            </div>
            {course.sections.length === 0 ? (
              <p className="rounded-lg border border-rule bg-surface p-5 text-graphite">
                The lessons appear here when the instructor publishes them.
              </p>
            ) : (
              <CourseModule
                variant="outline"
                slug={course.slug}
                playableIds={playable}
                openSectionIds={previewSectionIds.length > 0 ? previewSectionIds : undefined}
                sections={course.sections.map((section) => ({
                  id: section.id,
                  title: section.title,
                  items: section.items.map((item) => ({
                    id: item.id,
                    title: item.title,
                    type: item.type,
                    isPreview: item.isPreview,
                    contentType: item.lecture?.contentType ?? null,
                    durationSeconds: item.lecture?.durationSeconds || null,
                  })),
                }))}
              />
            )}
          </section>

          {course.requirements.length > 0 ? (
            <section aria-labelledby="requirements-heading">
              <h2 id="requirements-heading" className="text-2xl font-semibold">
                Requirements
              </h2>
              <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-base">
                {course.requirements.map((requirement, index) => (
                  <li key={index}>{requirement.text}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {course.description ? (
            <section aria-labelledby="description-heading">
              <h2 id="description-heading" className="text-2xl font-semibold">
                Description
              </h2>
              <p className="mt-4 max-w-[68ch] text-base whitespace-pre-line text-ink">
                <CodeText text={course.description} />
              </p>
            </section>
          ) : null}

          {course.targetAudience.length > 0 ? (
            <section aria-labelledby="audience-heading">
              <h2 id="audience-heading" className="text-2xl font-semibold">
                Who this course is for
              </h2>
              <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-base">
                {course.targetAudience.map((audience, index) => (
                  <li key={index}>{audience.text}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="instructor-heading" className="flex flex-col gap-4">
            <h2 id="instructor-heading" className="text-2xl font-semibold">
              Instructor
            </h2>
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink text-lg font-semibold text-white"
              >
                {initials(course.instructor.name, "?")}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-lg font-semibold">
                  {instructorHref ? (
                    <Link href={instructorHref} className="rounded-sm hover:underline focus-ring">
                      {course.instructor.name}
                    </Link>
                  ) : (
                    course.instructor.name
                  )}
                </p>
                {course.instructor.headline ? <p className="text-graphite">{course.instructor.headline}</p> : null}
                {course.instructor.bio ? (
                  <p className="mt-2 max-w-[68ch] text-base whitespace-pre-line">{course.instructor.bio}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section id="reviews" aria-labelledby="reviews-heading" className="flex flex-col gap-6">
            <h2 id="reviews-heading" className="text-2xl font-semibold">
              Learner reviews
            </h2>

            {summary.count > 0 ? (
              <div className="grid items-center gap-6 rounded-lg border border-rule bg-surface p-5 sm:grid-cols-[auto_1fr] sm:p-6">
                <div className="flex flex-col items-center gap-1 sm:pr-6">
                  <span className="text-4xl font-bold">{summary.average.toFixed(1)}</span>
                  <StarRating value={summary.average} />
                  <span className="text-sm text-graphite">{plural(summary.count, "rating")}</span>
                </div>
                <RatingHistogram distribution={summary.distribution} />
              </div>
            ) : (
              <p className="text-graphite">No ratings yet. Learners on the course can be the first to review it.</p>
            )}

            {/* Rendering the form is a convenience, not the authorisation:
                submitReview re-checks the enrollment server-side. ownReview
                goes through with its status, so a hidden review says so. */}
            {enrolled ? <ReviewForm courseId={course.id} existing={ownReview} /> : null}

            <ReviewList reviews={reviews} />

            {summary.count > REVIEW_PAGE_SIZE ? (
              <p className="text-sm text-graphite">
                Showing {reviewRange.from} to {reviewRange.to} of {summary.count}
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

          {course.faqs.length > 0 ? (
            <section aria-labelledby="faq-heading" className="flex flex-col gap-4">
              <h2 id="faq-heading" className="text-2xl font-semibold">
                Frequently asked questions
              </h2>
              <div className="overflow-hidden rounded-lg border border-rule bg-surface">
                {course.faqs.map((faq) => (
                  <details key={faq.id} className="group border-rule [&:not(:first-child)]:border-t">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-wash focus-ring-inset [&::-webkit-details-marker]:hidden">
                      <ChevronDown
                        className="size-4 shrink-0 text-graphite transition-transform duration-150 group-open:rotate-180"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 text-base font-semibold text-ink">{faq.question}</span>
                    </summary>
                    <p className="max-w-[68ch] border-t border-rule px-4 py-3 pl-11 text-base whitespace-pre-line text-ink">
                      <CodeText text={faq.answer} />
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <PurchaseBar panelId={PANEL_ID}>
        <CoursePrice isFree={course.isFree} price={course.price} className="text-xl" />
        <div className="w-44">{primary}</div>
      </PurchaseBar>
    </main>
  );
}

function Include({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden className="text-graphite [&_svg]:size-4 [&_svg]:stroke-[1.75]">
        {icon}
      </span>
      {children}
    </li>
  );
}

/** The one main action: go to the course, enrol for free, or buy it. */
function PrimaryAction({ course, enrolled }: { course: Course; enrolled: boolean }) {
  if (enrolled) {
    return (
      <Button asChild size="lg" className="w-full">
        <Link href={`/learn/${course.slug}` as Route}>Go to course</Link>
      </Button>
    );
  }
  if (course.isFree) {
    // Offered only when enrollFree would accept it: every active price is 0.
    return (
      <form action={enrollFree}>
        <input type="hidden" name="courseId" value={course.id} />
        <Button type="submit" size="lg" className="w-full">
          Enrol for free
        </Button>
      </form>
    );
  }
  if (course.price) {
    return (
      <Button asChild size="lg" className="w-full">
        <Link href={`/courses/${course.slug}/checkout` as Route}>Buy course</Link>
      </Button>
    );
  }
  return <p className="text-sm text-graphite">This course is not on sale right now.</p>;
}
