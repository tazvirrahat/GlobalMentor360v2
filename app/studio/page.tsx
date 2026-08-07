import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listInstructorCourses } from "@/lib/studio";
import { NewCourseForm } from "./new-course-form";

export const metadata = { title: "Studio — GlobalMentor360" };
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const [courses, categories] = await Promise.all([
    listInstructorCourses(user.id),
    db.category.findMany({
      where: { parentId: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <main>
      <h1>Studio</h1>

      <section>
        <h2>Your courses</h2>
        {courses.length === 0 ? (
          <p>No courses yet.</p>
        ) : (
          <ul>
            {courses.map((course) => (
              <li key={course.id}>
                <Link href={`/studio/courses/${course.id}`}>{course.title}</Link>
                <span> — {course.status}</span>
                <span>
                  {" "}
                  · {course._count.sections} sections · {course.enrollmentCount} enrolled
                </span>
                {course.status === "PUBLISHED" ? (
                  <>
                    {" · "}
                    <Link href={`/courses/${course.slug}`}>View public page</Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Create a course</h2>
        <NewCourseForm categories={categories} />
      </section>
    </main>
  );
}
