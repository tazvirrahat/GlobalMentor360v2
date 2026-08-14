import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAnnouncableCourses } from "@/lib/announcements";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Announcements · Studio" };

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const courses = await listAnnouncableCourses(user.id);

  // Scoped by author rather than by course: this is the instructor's own record
  // of what they have sent, and an ADMIN who posted to a course they teach should
  // see their own posts here, not everyone's.
  const sent = await db.announcement.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      subject: true,
      body: true,
      sentAt: true,
      course: { select: { title: true } },
    },
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Announcements</h1>
        <p className="mt-1 text-muted-foreground">
          Tell everyone enrolled in a course something they need to know.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>New announcement</CardTitle>
        </CardHeader>
        <CardContent>
          <Composer
            courses={courses.map((course) => ({
              id: course.id,
              title: course.title,
              learnerCount: course._count.enrollments,
            }))}
          />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold tracking-tight">Sent</h2>
        {sent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {sent.map((announcement) => (
              <li key={announcement.id}>
                <Card className="rounded-2xl">
                  <CardContent className="flex flex-col gap-1.5 p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-bold">{announcement.subject}</h3>
                      <span className="text-xs text-muted-foreground">
                        {announcement.course.title}
                        {announcement.sentAt
                          ? ` · ${announcement.sentAt.toLocaleDateString("en-GB")}`
                          : " · draft"}
                      </span>
                    </div>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">
                      {announcement.body}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
