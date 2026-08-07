import { CourseCard } from "@/components/site/course-card";
import { listPublishedCourses } from "@/lib/courses";

export const metadata = {
  title: "Courses",
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
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Courses</h1>
      <p className="mt-2 text-muted-foreground">
        {courses.length === 0
          ? "No published courses yet — check back soon."
          : `${courses.length} course${courses.length === 1 ? "" : "s"} to choose from.`}
      </p>

      {courses.length > 0 ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
