import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageNav } from "@/components/site/page-nav";
import {
  listAnnouncableCourses,
  listSentAnnouncements,
  pickDefaultAnnouncementCourseId,
} from "@/lib/announcements";
import { formatDate } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Announcements · Studio" };

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const { page: rawPage } = await searchParams;
  const [courses, sentPage] = await Promise.all([
    listAnnouncableCourses(user.id),
    listSentAnnouncements(user.id, rawPage),
  ]);
  const announcable = courses.map((course) => ({
    id: course.id,
    title: course.title,
    status: course.status,
    learnerCount: course._count.enrollments,
  }));
  const { items: sent, page, pageCount } = sentPage;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
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
            courses={announcable}
            defaultCourseId={pickDefaultAnnouncementCourseId(announcable)}
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
                          ? ` · ${formatDate(announcement.sentAt)}`
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
        <PageNav pathname="/studio/announcements" page={page} pageCount={pageCount} />
      </section>
    </main>
  );
}
