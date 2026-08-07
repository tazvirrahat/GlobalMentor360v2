import Link from "next/link";
import { formatPrice, listPublishedCourses } from "@/lib/courses";

export const metadata = {
  title: "Courses — GlobalMentor360",
  description: "Browse the course catalog.",
};

// Without this Next prerenders the catalog at build time, which breaks two ways:
// newly published courses never appear until a redeploy, and the build itself
// fails anywhere the database isn't reachable (CI). Revisit with `revalidate`
// once we want CDN caching — but a build-time snapshot is never right here.
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const courses = await listPublishedCourses();

  return (
    <main>
      <h1>Courses</h1>

      {courses.length === 0 ? (
        <p>No published courses yet.</p>
      ) : (
        <ul>
          {courses.map((course) => (
            <li key={course.id}>
              <h2>
                <Link href={`/courses/${course.slug}`}>{course.title}</Link>
              </h2>
              {course.subtitle ? <p>{course.subtitle}</p> : null}
              <p>
                {course.instructor.name}
                {course.primaryCategory ? ` · ${course.primaryCategory.name}` : null}
              </p>
              <p>
                {course.lectureCount} lectures · {course.totalDuration} · {course.level}
              </p>
              <p>
                {course.ratingCount > 0
                  ? `${course.ratingAverage.toFixed(1)} (${course.ratingCount} ratings)`
                  : "No ratings yet"}
              </p>
              <p>
                {course.price
                  ? formatPrice(course.price.amount, course.price.currency)
                  : "Free"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
