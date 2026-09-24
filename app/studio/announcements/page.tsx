import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/site/empty-state";
import { PageNav } from "@/components/site/page-nav";
import {
  listAnnouncableCourses,
  listSentAnnouncements,
  pickDefaultAnnouncementCourseId,
  SENT_ANNOUNCEMENT_PAGE_SIZE,
} from "@/lib/announcements";
import { formatDate } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
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
  const { items: sent, total, page, pageCount } = sentPage;
  const range = showingRange(page, SENT_ANNOUNCEMENT_PAGE_SIZE, total);

  const pager = (
    <>
      {sent.length > 0 ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          Showing {range.from}–{range.to} of {total}
        </p>
      ) : null}
      <PageNav pathname="/studio/announcements" page={page} pageCount={pageCount} />
    </>
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Announcements</h1>
        <p className="mt-1 text-muted-foreground">
          Tell everyone enrolled in a course something they need to know.
        </p>
      </header>

      <Card>
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
        <h2 className="font-heading text-xl font-semibold tracking-tight">Sent</h2>
        {sent.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-6" />}
            message="Nothing sent yet."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {pager}
            <ol className="overflow-hidden rounded-lg border bg-card shadow-sm">
              {sent.map((announcement) => (
                <li key={announcement.id} className="border-b last:border-b-0 hover:bg-muted/50">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                      <h3 className="font-heading text-sm font-semibold tracking-tight">
                        {announcement.subject}
                      </h3>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {announcement.course.title}
                        {announcement.sentAt
                          ? ` · ${formatDate(announcement.sentAt)}`
                          : " · draft"}
                      </span>
                    </summary>
                    <p className="whitespace-pre-line border-t px-3 py-2 text-sm text-muted-foreground">
                      {announcement.body}
                    </p>
                  </details>
                </li>
              ))}
            </ol>
            {pager}
          </div>
        )}
      </section>
    </main>
  );
}
