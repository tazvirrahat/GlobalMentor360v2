import type { Route } from "next";
import Link from "next/link";
import { Award, BadgeCheck, Clock, Search, Smartphone, Wallet } from "lucide-react";
import { Certificate, Seal } from "@/components/course/certificate";
import { ContinueCard } from "@/components/course/continue-card";
import type { CourseCardData } from "@/components/course/course-card";
import { CourseCover } from "@/components/course/course-cover";
import { CoursePrice } from "@/components/course/price";
import { VerifyCertificateForm } from "@/components/course/verify-certificate-form";
import { StarRating } from "@/components/site/star-rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listTopCategoriesWithCounts } from "@/lib/categories";
import { getContinueLearning } from "@/lib/continue-learning";
import { courseImageUrl } from "@/lib/course-image";
import { listHomeCourses } from "@/lib/courses";
import { getHomeStats } from "@/lib/home";
import { availableRails } from "@/lib/payments";
import { listHomeTestimonials } from "@/lib/reviews";
import { getCurrentUser, getUserRoles } from "@/lib/session";
import { getSite } from "@/lib/site";
import { HomeCourseTabs, type CourseGroup } from "./home-course-tabs";

export const dynamic = "force-dynamic";

const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
const NEW_DAYS = 30;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

/** One honest badge per course, from real numbers: the most enrolled, the best rated, or recently published. */
function badgeFor(course: CourseCardData & { enrollmentCount: number; publishedAt?: Date | null }, all: typeof course[]) {
  const mostEnrolled = all.reduce((a, b) => (b.enrollmentCount > a.enrollmentCount ? b : a));
  const rated = all.filter((c) => c.ratingCount >= 2);
  const topRated = rated.length ? rated.reduce((a, b) => (b.ratingAverage > a.ratingAverage ? b : a)) : null;
  if (course.id === mostEnrolled.id && course.enrollmentCount > 0) return "Most popular" as const;
  if (topRated && course.id === topRated.id) return "Top rated" as const;
  if (course.publishedAt && Date.now() - course.publishedAt.getTime() < NEW_DAYS * 864e5 && course.ratingCount === 0) {
    return "New" as const;
  }
  return null;
}

/**
 * The storefront, laid out like the course marketplaces people already know
 * (Udemy, Coursera, 10 Minute School): a hero with search and a picture of the
 * product, real numbers, courses by subject, certificates, reviews, and a
 * call for instructors. Brand copy comes from lib/site.ts; every number and
 * badge comes from the database.
 */
export default async function HomePage() {
  const site = getSite();
  const user = await getCurrentUser();
  const [popular, categories, testimonials, continueLearning, stats, roles] = await Promise.all([
    listHomeCourses(12),
    listTopCategoriesWithCounts(),
    listHomeTestimonials(3, 4),
    user ? getContinueLearning(user.id) : Promise.resolve(null),
    getHomeStats(),
    user ? getUserRoles(user.id) : Promise.resolve([]),
  ]);
  const cardAvailable = availableRails().some((rail) => rail.kind === "automatic");
  const teaches = roles.includes("INSTRUCTOR");

  const courses = popular as (CourseCardData & { enrollmentCount: number; publishedAt?: Date | null })[];
  const withBadges = courses.map((course) => ({ course, badge: badgeFor(course, courses) }));
  const subjects = new Map<string, CourseGroup>();
  for (const item of withBadges) {
    const category = item.course.primaryCategory;
    if (!category) continue;
    const group = subjects.get(category.slug) ?? { key: category.slug, label: category.name, courses: [] };
    group.courses.push(item);
    subjects.set(category.slug, group);
  }
  const groups: CourseGroup[] = [
    { key: "all", label: "All courses", courses: withBadges.slice(0, 8) },
    ...[...subjects.values()].sort((a, b) => b.courses.length - a.courses.length),
  ];
  const hero = courses[0];

  const statItems = [
    { value: String(stats.courses), label: stats.courses === 1 ? "course" : "courses" },
    { value: String(stats.learners), label: stats.learners === 1 ? "learner enrolled" : "learners enrolled" },
    stats.averageRating
      ? { value: stats.averageRating.toFixed(1), label: `average rating from ${stats.reviews} reviews` }
      : null,
    { value: String(stats.instructors), label: stats.instructors === 1 ? "instructor" : "instructors" },
  ].filter((item): item is { value: string; label: string } => item !== null);

  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section aria-labelledby="home-heading" className="border-b border-rule bg-surface">
        <div className={`${WRAP} grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:py-20`}>
          <div className="flex flex-col gap-6">
            <h1 id="home-heading" className="text-4xl font-bold sm:text-5xl">
              {site.headline}
            </h1>
            <p className="max-w-xl text-lg text-graphite">{site.lede}</p>
            <form role="search" action="/courses" method="get" className="flex max-w-xl flex-col gap-2 sm:flex-row">
              <label htmlFor="home-search" className="sr-only">
                Search courses
              </label>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-graphite" aria-hidden />
                <Input
                  id="home-search"
                  type="search"
                  name="q"
                  placeholder="What do you want to learn?"
                  className="h-12 pl-11 text-base"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 px-6">
                Search
              </Button>
            </form>
            {categories.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-graphite">Popular:</span>
                {categories
                  .flatMap((category) => category.children)
                  .slice(0, 4)
                  .map((child) => (
                    <Link
                      key={child.slug}
                      href={`/courses?category=${child.slug}` as Route}
                      className="inline-flex min-h-8 items-center rounded-full border border-rule bg-paper px-3 text-sm text-ink hover:border-control focus-ring"
                    >
                      {child.name}
                    </Link>
                  ))}
              </div>
            ) : null}
          </div>

          {continueLearning ? (
            <ContinueCard data={continueLearning} />
          ) : hero ? (
            // A picture of the product: a real course, a learner's progress, and the certificate at the end.
            <div aria-hidden className="relative mx-auto w-full max-w-md pb-16 lg:pb-20">
              <div className="rounded-lg border border-rule bg-surface p-3 shadow-md">
                <CourseCover
                  title={hero.title}
                  slug={hero.slug}
                  categorySlug={hero.primaryCategory?.slug}
                  categoryName={hero.primaryCategory?.name}
                  imageUrl={courseImageUrl(hero.id, hero.thumbnailUrl)}
                  priority
                />
                <div className="flex items-center justify-between gap-3 px-1 pt-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{hero.title}</p>
                    <p className="text-sm text-graphite">{hero.instructor.name}</p>
                  </div>
                  <CoursePrice isFree={hero.isFree} price={hero.price} />
                </div>
              </div>
              <div className="absolute bottom-0 -left-4 w-56 rounded-lg border border-rule bg-surface p-3 shadow-md sm:-left-10">
                <p className="text-sm font-semibold text-ink">Your progress</p>
                <div className="mt-2 h-2 rounded-full bg-wash">
                  <div className="h-2 w-3/5 rounded-full bg-ink" />
                </div>
                <p className="mt-1.5 text-xs text-graphite">6 of 10 lessons done</p>
              </div>
              <div className="absolute -right-2 bottom-2 flex items-center gap-2 rounded-lg border border-rule bg-surface py-2 pr-4 pl-2 shadow-md sm:-right-8">
                <Seal size={36} />
                <div>
                  <p className="text-sm font-semibold text-ink">Certificate earned</p>
                  <p className="text-xs text-graphite">Shareable and verifiable</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Trust strip: real numbers only */}
      {stats.courses > 0 ? (
        <section aria-label={`${site.name} in numbers`} className="border-b border-rule bg-ink text-white">
          <dl className={`${WRAP} grid grid-cols-2 gap-6 py-8 md:grid-cols-4`}>
            {statItems.map((item) => (
              <div key={item.label} className="flex flex-col-reverse">
                <dt className="text-sm text-white/75">{item.label}</dt>
                <dd className="text-3xl font-bold tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {/* Courses by subject */}
      {courses.length > 0 ? (
        <section aria-labelledby="courses-heading" className={`${WRAP} py-12 sm:py-16`}>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 id="courses-heading" className="text-2xl font-bold sm:text-3xl">
                A course for your next step
              </h2>
              <p className="text-graphite">Practical courses by subject, from first steps to job-ready.</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/courses">See all courses</Link>
            </Button>
          </div>
          <HomeCourseTabs groups={groups} />
        </section>
      ) : null}

      {/* Subjects */}
      {categories.length > 0 ? (
        <section aria-labelledby="subjects-heading" className="border-t border-rule bg-surface">
          <div className={`${WRAP} py-12 sm:py-16`}>
            <h2 id="subjects-heading" className="text-2xl font-bold sm:text-3xl">
              Top categories
            </h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {categories.flatMap((category) =>
                category.children.map((child) => (
                  <li key={child.slug}>
                    <Link
                      href={`/courses?category=${child.slug}` as Route}
                      className="group flex h-full flex-col gap-3 rounded-lg border border-rule bg-paper p-4 hover:border-control focus-ring"
                    >
                      <CourseCover title={child.name} slug={child.slug} categorySlug={child.slug} className="aspect-[5/2]" />
                      <span className="text-sm text-graphite group-hover:text-ink">
                        {category.name}, browse courses
                      </span>
                    </Link>
                  </li>
                )),
              )}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Why learn here */}
      <section aria-labelledby="why-heading" className="border-t border-rule">
        <div className={`${WRAP} py-12 sm:py-16`}>
          <h2 id="why-heading" className="text-2xl font-bold sm:text-3xl">
            Learning that fits your life
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Clock, title: "Learn at your own pace", body: "Short lessons you can take whenever you have time. Your place is always saved." },
              { icon: Smartphone, title: "On your phone or laptop", body: "Every course works on a phone, so you can learn on the bus or at your desk." },
              { icon: Award, title: "Earn a certificate", body: "Finish the lessons and quizzes and get a certificate with its own page to share." },
              {
                icon: Wallet,
                title: cardAvailable ? "Pay with bKash or card" : "Pay with bKash",
                body: "Prices in taka. Pay once and keep the course for life, with no subscription.",
              },
            ].map((item) => (
              <li key={item.title} className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5">
                <span className="flex size-10 items-center justify-center rounded-md bg-wash text-ink">
                  <item.icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-bold">{item.title}</h3>
                <p className="text-graphite">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Certificates */}
      <section aria-labelledby="certificate-heading" className="border-t border-rule bg-surface">
        <div className={`${WRAP} grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-2`}>
          <div className="flex flex-col gap-4">
            <h2 id="certificate-heading" className="text-2xl font-bold sm:text-3xl">
              Show employers what you finished
            </h2>
            <p className="text-lg text-graphite">
              Every certificate has its own public page. Add the link to your CV or LinkedIn, and anyone can check it is real.
            </p>
            <ul className="flex flex-col gap-2">
              {["Issued the moment you complete a course", "Download as PDF or share a link", "Checked by number, in seconds"].map(
                (point) => (
                  <li key={point} className="flex items-center gap-2 text-ink">
                    <BadgeCheck className="size-5 text-verified" aria-hidden />
                    {point}
                  </li>
                ),
              )}
            </ul>
            <div className="mt-2 max-w-lg">
              <h3 className="mb-3 text-base font-semibold">Check a certificate</h3>
              <VerifyCertificateForm id="home-serial" />
            </div>
          </div>
          <div className="pr-2.5 pb-2.5">
            <Certificate
              size="card"
              siteName={site.name}
              recipient="Your name"
              course={hero?.title ?? "Your course"}
              issuedAt={new Date()}
              serial={`${site.certificatePrefix}-1A2B-3C4D-5E6F-7A8B`}
            />
          </div>
        </div>
      </section>

      {/* Reviews */}
      {testimonials.length > 0 ? (
        <section aria-labelledby="reviews-heading" className="border-t border-rule">
          <div className={`${WRAP} py-12 sm:py-16`}>
            <h2 id="reviews-heading" className="text-2xl font-bold sm:text-3xl">
              What learners say
            </h2>
            <ul className="mt-8 grid gap-6 md:grid-cols-3">
              {testimonials.map((item) => (
                <li key={item.id}>
                  <figure className="flex h-full flex-col gap-4 rounded-lg border border-rule bg-surface p-6">
                    <StarRating value={item.rating} starClassName="size-4" />
                    <blockquote className="text-base text-ink">
                      <p>“{item.body}”</p>
                    </blockquote>
                    <figcaption className="mt-auto flex items-center gap-3 border-t border-rule pt-4">
                      <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-wash text-sm font-bold text-ink">
                        {initials(item.authorName)}
                      </span>
                      <span className="text-sm">
                        <span className="block font-semibold text-ink">{item.authorName}</span>
                        <span className="block text-graphite">{item.courseTitle}</span>
                      </span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Instructors */}
      <section aria-labelledby="teach-heading" className="bg-ink text-white">
        <div className={`${WRAP} flex flex-col items-start gap-6 py-12 sm:py-16 md:flex-row md:items-center md:justify-between`}>
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 id="teach-heading" className="text-2xl font-bold sm:text-3xl">
              Teach what you know
            </h2>
            <p className="text-lg text-white/80">
              Share your skills with learners across Bangladesh. Build your course with video, articles and quizzes, and get paid in taka.
            </p>
          </div>
          <Button asChild size="lg" className="bg-white text-ink hover:bg-white/90 focus-visible:outline-white">
            <Link href={(teaches ? "/studio" : user ? "/help" : "/sign-up") as Route}>
              {teaches ? "Go to your studio" : "Start teaching"}
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
