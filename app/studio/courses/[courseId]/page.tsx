import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getOwnedCourse, readinessChecks } from "@/lib/studio";
import { PublishForm, SettingsForm } from "./settings-form";

export const metadata = { title: "Course settings — Studio" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ courseId: string }> };

export default async function CourseSettingsPage({ params }: Params) {
  const { courseId } = await params;
  const user = await requireRole("INSTRUCTOR", "ADMIN");

  // Returns null for another instructor's course as well as a missing one, so a
  // 404 is the correct response either way — and it doesn't confirm existence.
  const course = await getOwnedCourse(courseId, user.id);
  if (!course) notFound();

  const checks = await readinessChecks(course.id);
  const ready = checks.every((check) => check.ok);

  return (
    <main>
      <p>
        <Link href="/studio">← Studio</Link>
      </p>

      <h1>{course.title}</h1>
      <p>Status: {course.status}</p>
      <p>
        <Link href={`/studio/courses/${course.id}/curriculum`}>Edit curriculum →</Link>
      </p>

      <section>
        <h2>Readiness</h2>
        <ul>
          {checks.map((check) => (
            <li key={check.label}>
              {check.ok ? "✓" : "✗"} {check.label}
              {check.ok ? null : <span> — {check.hint}</span>}
            </li>
          ))}
        </ul>
        <PublishForm courseId={course.id} status={course.status} ready={ready} />
      </section>

      <section>
        <h2>Settings</h2>
        <SettingsForm course={course} />
      </section>
    </main>
  );
}
