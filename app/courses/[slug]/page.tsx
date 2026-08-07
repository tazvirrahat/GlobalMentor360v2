import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canPlayItem } from "@/lib/entitlement";
import { formatPrice, getPublishedCourseBySlug } from "@/lib/courses";
import { getCurrentUser } from "@/lib/session";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) return { title: "Not found" };

  return {
    title: `${course.title} — GlobalMentor360`,
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

export default async function CourseLandingPage({ params }: Params) {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);

  if (!course) notFound();

  // Signed-out visitors see the page; entitlement decides only what is playable.
  const user = await getCurrentUser();

  const playable = new Set<string>();
  for (const section of course.sections) {
    for (const item of section.items) {
      const decision = await canPlayItem(user?.id ?? null, item.id);
      if (decision.allowed) playable.add(item.id);
    }
  }

  return (
    <main>
      <h1>{course.title}</h1>
      {course.subtitle ? <p>{course.subtitle}</p> : null}

      <p>
        {course.ratingCount > 0
          ? `${course.ratingAverage.toFixed(1)} (${course.ratingCount} ratings)`
          : "No ratings yet"}{" "}
        · {course.enrollmentCount} enrolled · {course.level} · {course.language}
      </p>
      <p>Created by {course.instructor.name}</p>
      <p>{course.price ? formatPrice(course.price.amount, course.price.currency) : "Free"}</p>

      {course.objectives.length > 0 ? (
        <section>
          <h2>What you&rsquo;ll learn</h2>
          <ul>
            {course.objectives.map((objective, index) => (
              <li key={index}>{objective.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>Course content</h2>
        <p>
          {course.sections.length} sections · {course.itemCount} items · {course.totalDuration}
        </p>

        {course.sections.map((section) => (
          <details key={section.id}>
            <summary>
              {section.title} — {section.items.length} items · {section.duration}
            </summary>
            <ul>
              {section.items.map((item) => (
                <li key={item.id}>
                  <span>{ITEM_LABEL[item.type] ?? item.type}: </span>
                  <span>{item.title}</span>
                  {item.isPreview ? <span> · Preview</span> : null}
                  {playable.has(item.id) ? <span> · Playable</span> : <span> · Locked</span>}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>

      {course.requirements.length > 0 ? (
        <section>
          <h2>Requirements</h2>
          <ul>
            {course.requirements.map((requirement, index) => (
              <li key={index}>{requirement.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {course.description ? (
        <section>
          <h2>Description</h2>
          <p>{course.description}</p>
        </section>
      ) : null}

      {course.targetAudience.length > 0 ? (
        <section>
          <h2>Who this course is for</h2>
          <ul>
            {course.targetAudience.map((audience, index) => (
              <li key={index}>{audience.text}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
