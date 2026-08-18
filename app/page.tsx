import Link from "next/link";
import {
  Award,
  ListChecks,
  PlayCircle,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CourseCard } from "@/components/site/course-card";
import { listPublishedCourses, countPublishedCourses } from "@/lib/courses";
import { availableRails } from "@/lib/payments";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: PlayCircle,
    title: "Video-first learning",
    body: "High-quality recorded lessons. Watch any time, on any device, at your own pace.",
  },
  {
    icon: ListChecks,
    title: "Quiz-gated lessons",
    body: "Every lesson can end with a quiz. Pass to unlock the next — no skipping ahead.",
  },
  {
    icon: Award,
    title: "Verifiable certificates",
    body: "Finish a course and earn a certificate with a public verification link.",
  },
  {
    icon: UserRound,
    title: "Learn from our experts",
    body: "Courses are designed and taught by our own instructors — one academy, one standard.",
  },
];

// Step 1 names only the payment methods actually offered: the card rail hides
// itself without Stripe keys, and a landing page promising "card" while
// checkout shows only bKash is the kind of copy/behaviour drift this replaced.
function steps(cardAvailable: boolean) {
  return [
    {
      title: "Enrol in a course",
      body: `Pick a course that fits your goal and pay securely — ${
        cardAvailable ? "bKash or card" : "with bKash"
      }.`,
    },
    {
      title: "Watch video lessons",
      body: "Structured sections and lectures, built to take you from zero to done.",
    },
    {
      title: "Pass the quizzes",
      body: "Confirm your understanding to unlock the next lesson.",
    },
    {
      title: "Get certified",
      body: "Finish the course and earn a verifiable certificate.",
    },
  ];
}

export default async function HomePage() {
  const [catalog, publishedCount] = await Promise.all([
    listPublishedCourses(),
    countPublishedCourses(),
  ]);
  const featured = catalog.items.slice(0, 3);
  const cardAvailable = availableRails().some((rail) => rail.kind === "automatic");
  const STEPS = steps(cardAvailable);

  return (
    <main>
      {/* Hero */}
      <section className="bg-hero-gradient text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Learn real skills.
            <br />
            <span className="text-gradient-brand">Earn real certificates.</span>
          </h1>
          <p className="max-w-2xl text-lg text-white/80">
            A structured online academy: video lessons, quiz-gated progress and verifiable
            certificates. Buy a course once, keep it forever.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="shadow-brand">
              <Link href="/courses">Explore courses</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/sign-up">Start free</Link>
            </Button>
          </div>

          <dl className="mt-10 grid w-full max-w-2xl grid-cols-3 gap-2 sm:gap-4">
            {[
              { value: `${publishedCount}+`, label: "Courses" },
              { value: "Own pace", label: "Learn anywhere" },
              { value: "Lifetime", label: "Course access" },
            ].map((stat) => (
              <div key={stat.label} className="min-w-0">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-xl font-extrabold sm:text-3xl">{stat.value}</dd>
                <dd className="text-xs text-white/70 sm:text-sm">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">
          Structured learning, measurable outcomes
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          One platform, structured pathways — from first lesson to certificate.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="rounded-2xl">
              <CardContent className="flex flex-col gap-3 p-6">
                <span className="flex size-11 items-center justify-center rounded-full bg-brand text-primary-foreground">
                  <feature.icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-bold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Featured courses */}
      {featured.length > 0 ? (
        <section className="bg-surface-alt">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight">Featured courses</h2>
                <p className="mt-2 text-muted-foreground">Start with our most popular paths.</p>
              </div>
              <Button asChild variant="outline">
                <Link href="/courses">View all</Link>
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

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">How it works</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          From enrolment to certificate, in four steps.
        </p>

        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2">
              <span className="text-5xl font-extrabold text-brand-pink-faint" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-bold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA */}
      <section className="bg-hero-gradient text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center sm:px-6">
          <h2 className="text-3xl font-extrabold tracking-tight">
            Ready to start learning?
          </h2>
          <p className="max-w-xl text-white/80">
            Join learners who chose structured training over guesswork.
          </p>
          <Button asChild size="lg" className="shadow-brand">
            <Link href="/sign-up">Create your account</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
