import type { Metadata } from "next";
import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { EmptyState } from "@/components/site/empty-state";
import {
  listAnnouncableCourses,
  listSentAnnouncements,
  pickDefaultAnnouncementCourseId,
  SENT_ANNOUNCEMENT_PAGE_SIZE,
} from "@/lib/announcements";
import { formatDateMedium } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { requireRole } from "@/lib/session";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Announcements | Studio" };

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

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Announcements"
        description="Tell everyone enrolled in a course something they need to know."
      />

      <Panel title="New announcement">
        <Composer courses={announcable} defaultCourseId={pickDefaultAnnouncementCourseId(announcable)} />
      </Panel>

      <section aria-labelledby="sent-heading" className="flex flex-col gap-3">
        <h2 id="sent-heading" className="text-lg font-semibold">
          Sent
        </h2>
        {sent.length === 0 ? (
          <EmptyState headingLevel={3} title="Nothing sent yet" message="Announcements you send appear here." />
        ) : (
          <>
            <ol className="flex flex-col divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-surface">
              {sent.map((announcement) => (
                <li key={announcement.id}>
                  <details>
                    <summary className="flex min-h-12 cursor-pointer list-none flex-col gap-0.5 px-4 py-3 hover:bg-wash/60 focus-ring-inset [&::-webkit-details-marker]:hidden">
                      <h3 className="font-medium text-ink">{announcement.subject}</h3>
                      <span className="flex flex-wrap gap-x-3 text-sm text-graphite">
                        <span>{announcement.course.title}</span>
                        {announcement.sentAt ? (
                          <time dateTime={announcement.sentAt.toISOString()}>
                            Sent {formatDateMedium(announcement.sentAt)}
                          </time>
                        ) : (
                          <span>Not sent</span>
                        )}
                      </span>
                    </summary>
                    <p className="max-w-[68ch] border-t border-rule px-4 py-3 whitespace-pre-line text-ink">
                      {announcement.body}
                    </p>
                  </details>
                </li>
              ))}
            </ol>
            <ListFooter range={range} total={total} pathname="/studio/announcements" page={page} pageCount={pageCount} />
          </>
        )}
      </section>
    </main>
  );
}
