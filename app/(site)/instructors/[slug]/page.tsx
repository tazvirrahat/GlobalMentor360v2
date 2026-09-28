import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, Star } from "lucide-react";
import { CourseRow } from "@/components/course/course-row";
import { getInstructorProfile } from "@/lib/instructors";
import { initials } from "@/lib/nav";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getInstructorProfile(slug);
  if (!profile) return { title: "Instructor not found" };
  return {
    title: profile.name,
    description: profile.headline ?? `Online courses taught by ${profile.name}.`,
  };
}

export const dynamic = "force-dynamic";

function count(n: number, one: string, many: string) {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
}

/** A public instructor page: who they are, what they teach, how learners rate it. */
export default async function InstructorPage({ params }: Params) {
  const { slug } = await params;
  const profile = await getInstructorProfile(slug);
  if (!profile) notFound();

  const paragraphs = (profile.bio ?? "").split(/\n\s*\n/).filter((part) => part.trim());
  const website = profile.websiteUrl ? new URL(profile.websiteUrl) : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <span
          aria-hidden
          className="flex size-20 shrink-0 items-center justify-center rounded-full bg-ink text-2xl font-semibold text-surface sm:size-24"
        >
          {initials(profile.name, "?")}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-semibold text-graphite">Instructor</p>
          <h1 className="text-3xl font-semibold text-balance sm:text-4xl">{profile.name}</h1>
          {profile.headline ? <p className="text-lg text-graphite">{profile.headline}</p> : null}
        </div>
      </header>

      <dl className="flex flex-wrap gap-x-10 gap-y-4 border-y border-rule py-5">
        <div className="flex flex-col">
          <dt className="text-sm text-graphite">Courses</dt>
          <dd className="text-2xl font-semibold text-ink tabular-nums">{profile.courseCount}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-sm text-graphite">Learners</dt>
          <dd className="text-2xl font-semibold text-ink">{profile.learnerCount.toLocaleString("en")}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-sm text-graphite">Average rating</dt>
          <dd className="flex items-center gap-1.5 text-2xl font-semibold text-ink">
            {profile.ratingAverage === null ? (
              <span className="text-base font-medium text-graphite">No ratings yet</span>
            ) : (
              <>
                <Star className="size-5 fill-current text-star" aria-hidden />
                {profile.ratingAverage.toFixed(1)}
                <span className="text-base font-normal text-graphite">
                  ({count(profile.ratingCount, "rating", "ratings")})
                </span>
              </>
            )}
          </dd>
        </div>
      </dl>

      {paragraphs.length > 0 || website ? (
        <section aria-labelledby="about-heading" className="flex flex-col gap-4">
          <h2 id="about-heading" className="text-2xl font-semibold">
            About
          </h2>
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="max-w-[68ch] text-base whitespace-pre-line text-ink">
              {paragraph.trim()}
            </p>
          ))}
          {website ? (
            <a
              href={website.toString()}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
            >
              {website.host}
              <ExternalLink className="size-4" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="courses-heading" className="flex flex-col gap-2">
        <h2 id="courses-heading" className="text-2xl font-semibold">
          Courses
        </h2>
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {profile.courses.map((course) => (
            <li key={course.id}>
              <CourseRow course={course} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
