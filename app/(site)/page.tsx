import type { Route } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Certificate } from "@/components/course/certificate";
import { ContinueCard } from "@/components/course/continue-card";
import { CourseRow } from "@/components/course/course-row";
import { VerifyCertificateForm } from "@/components/course/verify-certificate-form";
import { StarRating } from "@/components/site/star-rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listTopCategoriesWithCounts } from "@/lib/categories";
import { getContinueLearning } from "@/lib/continue-learning";
import { listPublishedCourses } from "@/lib/courses";
import { availableRails } from "@/lib/payments";
import { listHomeTestimonials } from "@/lib/reviews";
import { getCurrentUser } from "@/lib/session";
import { getSite } from "@/lib/site";

export const dynamic = "force-dynamic";

const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
const LINK =
  "rounded-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring";

function courses(count: number) {
  return `${count} ${count === 1 ? "course" : "courses"}`;
}

/**
 * The storefront (spec §6): search, subjects, popular courses, what the
 * certificate is, three plain facts, and real reviews. The copy reads like a
 * course marketplace and the brand copy comes from lib/site.ts.
 */
export default async function HomePage() {
  const site = getSite();
  const user = await getCurrentUser();
  const [catalog, categories, testimonials, continueLearning] = await Promise.all([
    listPublishedCourses({ sort: "popular" }),
    listTopCategoriesWithCounts(),
    listHomeTestimonials(3, 4),
    user ? getContinueLearning(user.id) : Promise.resolve(null),
  ]);
  const popular = catalog.items.slice(0, 6);
  const cardAvailable = availableRails().some((rail) => rail.kind === "automatic");

  return (
    <main className="flex flex-col">
      <section aria-labelledby="home-heading" className="border-b border-rule bg-surface">
        <div
          className={`${WRAP} grid items-start gap-10 py-10 sm:py-16 ${continueLearning ? "lg:grid-cols-[minmax(0,1fr)_24rem]" : ""}`}
        >
          <div className="flex max-w-2xl flex-col gap-6">
            <h1 id="home-heading" className="text-4xl font-bold sm:text-5xl">
              {site.headline}
            </h1>
            <p className="text-lg text-graphite">{site.lede}</p>
            <form role="search" action="/courses" method="get" className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="home-search" className="sr-only">
                Search courses
              </label>
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-graphite"
                  aria-hidden
                />
                <Input
                  id="home-search"
                  type="search"
                  name="q"
                  placeholder="What do you want to learn?"
                  className="h-11 pl-9 text-base"
                />
              </div>
              <Button type="submit" size="lg">
                Search
              </Button>
            </form>
            <div>
              <Button asChild size="lg" variant="secondary">
                <Link href="/courses">Browse courses</Link>
              </Button>
            </div>
          </div>
          {continueLearning ? <ContinueCard data={continueLearning} /> : null}
        </div>
      </section>

      {categories.length > 0 ? (
        <section aria-labelledby="subjects-heading" className={`${WRAP} py-10 sm:py-16`}>
          <h2 id="subjects-heading" className="text-2xl font-semibold sm:text-3xl">
            Explore by subject
          </h2>
          <ul className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li key={category.slug} className="flex flex-col gap-2 border-t border-rule pt-4">
                <Link
                  href={`/courses?category=${category.slug}` as Route}
                  className="group flex min-h-11 flex-col justify-center rounded-sm focus-ring"
                >
                  <span className="text-lg font-semibold text-ink group-hover:underline group-hover:decoration-control group-hover:underline-offset-4">
                    {category.name}
                  </span>
                  <span className="text-sm text-graphite">{courses(category.count)}</span>
                </Link>
                {category.children.length > 0 ? (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {category.children.map((child) => (
                      <li key={child.slug}>
                        <Link
                          href={`/courses?category=${child.slug}` as Route}
                          className="inline-flex min-h-6 items-center text-sm text-graphite hover:text-ink hover:underline focus-ring rounded-sm"
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {popular.length > 0 ? (
        <section aria-labelledby="popular-heading" className="border-t border-rule bg-surface">
          <div className={`${WRAP} py-10 sm:py-16`}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="popular-heading" className="text-2xl font-semibold sm:text-3xl">
                Popular courses
              </h2>
              <Link href="/courses" className={`${LINK} inline-flex min-h-6 items-center`}>
                See all courses
              </Link>
            </div>
            <ul className="mt-6 flex flex-col divide-y divide-rule border-y border-rule">
              {popular.map((course, index) => (
                // Phones get four; "See all courses" is right above.
                <li key={course.id} className={index >= 4 ? "max-sm:hidden" : undefined}>
                  <CourseRow course={course} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="certificate-heading" className="border-t border-rule">
        <div className={`${WRAP} grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-2`}>
          <div className="flex flex-col gap-4">
            <h2 id="certificate-heading" className="text-2xl font-semibold sm:text-3xl">
              Get a certificate when you finish
            </h2>
            <p className="text-lg text-graphite">
              Share it with employers. Anyone can check it on its own page, so it is easy to trust.
            </p>
            <div className="mt-2 max-w-lg">
              <h3 className="mb-3 text-base font-semibold">Check a certificate</h3>
              <VerifyCertificateForm id="home-serial" />
            </div>
          </div>
          <div className="flex flex-col gap-3 pr-2.5 pb-2.5">
            <p className="text-sm text-graphite">Sample certificate</p>
            <Certificate
              size="card"
              siteName={site.name}
              recipient="Your name"
              course={popular[0]?.title ?? "Your course"}
              issuedAt={new Date()}
              serial={`${site.certificatePrefix}-1A2B-3C4D-5E6F-7A8B`}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="why-heading" className="border-t border-rule bg-surface">
        <div className={`${WRAP} py-10 sm:py-16`}>
          <h2 id="why-heading" className="text-2xl font-semibold sm:text-3xl">
            Why learn here
          </h2>
          <div className="mt-6 grid gap-8 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold">Learn at your own pace</h3>
              <p className="text-graphite">
                Short lessons you can take on your phone or laptop, whenever you have time. Your place is saved.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold">A certificate when you finish</h3>
              <p className="text-graphite">
                Complete the lessons and the quizzes and your certificate is issued straight away, with its own page.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold">
                {cardAvailable ? "Pay in taka with bKash, or by card" : "Pay in taka with bKash"}
              </h3>
              <p className="text-graphite">
                Prices are in taka. Pay once and keep the course: there is no subscription.
              </p>
            </div>
          </div>
        </div>
      </section>

      {testimonials.length > 0 ? (
        <section aria-labelledby="reviews-heading" className="border-t border-rule">
          <div className={`${WRAP} py-10 sm:py-16`}>
            <h2 id="reviews-heading" className="text-2xl font-semibold sm:text-3xl">
              What learners say
            </h2>
            <ul className="mt-6 grid gap-8 md:grid-cols-3">
              {testimonials.map((item, index) => (
                <li key={item.id} className={index >= 2 ? "max-md:hidden" : undefined}>
                  <figure className="flex h-full flex-col gap-3">
                    <StarRating value={item.rating} starClassName="size-4" />
                    <blockquote className="text-base text-ink">
                      <p>{item.body}</p>
                    </blockquote>
                    <figcaption className="mt-auto text-sm">
                      <span className="block font-semibold text-ink">{item.authorName}</span>
                      <span className="block text-graphite">{item.courseTitle}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
