import Link from "next/link";
import { Award, BookOpen, PlayCircle, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CourseCard } from "@/components/site/course-card";
import { StarRating } from "@/components/site/star-rating";
import { listPublishedCourses } from "@/lib/courses";
import { availableRails } from "@/lib/payments";
import { listHomeTestimonials } from "@/lib/reviews";
import { getSite } from "@/lib/site";

export const dynamic = "force-dynamic";

function howItWorks(cardAvailable: boolean) {
  return [
    {
      icon: BookOpen,
      title: "Enrol in a course",
      body: `Pick a path that fits your goal and pay securely — ${
        cardAvailable ? "bKash or card" : "with bKash"
      }.`,
    },
    {
      icon: PlayCircle,
      title: "Learn with quizzes",
      body: "Watch structured video lessons. Pass the quiz to unlock the next — no skipping ahead.",
    },
    {
      icon: Award,
      title: "Earn a certificate",
      body: "Finish the course and receive a certificate with a public verification link.",
    },
  ];
}

export default async function HomePage() {
  const [catalog, testimonials] = await Promise.all([
    listPublishedCourses({ sort: "popular" }),
    listHomeTestimonials(3),
  ]);
  const featured = catalog.items.slice(0, 3);
  const cardAvailable = availableRails().some((rail) => rail.kind === "automatic");
  const steps = howItWorks(cardAvailable);

  const site = getSite();

  return (
    <main>
      <section className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <h1 className="max-w-3xl font-heading text-3xl font-bold sm:text-5xl">{site.headline}</h1>
          <p className="max-w-2xl text-lg text-graphite">{site.lede}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/courses">Browse courses</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/sign-up">Create a free account</Link>
            </Button>
          </div>
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="bg-wash">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                  Featured courses
                </h2>
                <p className="mt-2 text-muted-foreground">Start with our most popular paths.</p>
              </div>
              <Button asChild variant="outline">
                <Link href="/courses" className="cursor-pointer">
                  View all
                </Link>
              </Button>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <h2 className="text-center font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          How it works
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          From enrolment to certificate, in three steps.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title}>
              <article className="flex h-full flex-col gap-4 rounded-lg border bg-card p-6 shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <step.icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-heading text-sm font-semibold tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-heading text-lg font-semibold tracking-tight">{step.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{step.body}</p>
              </article>
            </div>
          ))}
        </div>
      </section>

      {testimonials.length > 0 ? (
        <section className="bg-wash">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <h2 className="text-center font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              What learners say
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
              Reviews from people who finished a course on this academy.
            </p>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((item) => (
                <li key={item.id}>
                  <Card className="h-full">
                    <CardContent className="flex h-full flex-col gap-4 p-6">
                      <Quote className="size-5 text-primary" aria-hidden />
                      <StarRating value={item.rating} />
                      <p className="line-clamp-5 text-base leading-relaxed text-foreground">
                        {item.body}
                      </p>
                      <p className="mt-auto text-sm">
                        <span className="font-semibold">{item.authorName}</span>
                        <span className="block truncate text-muted-foreground" title={item.courseTitle}>
                          {item.courseTitle}
                        </span>
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <div>
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center sm:px-6 lg:px-8">
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready to start learning?
            </h2>
            <p className="max-w-xl text-primary-foreground/85">
              Join learners who chose structured training over guesswork.
            </p>
            <Button asChild size="lg">
              <Link href="/courses" className="cursor-pointer">
                Explore courses
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
