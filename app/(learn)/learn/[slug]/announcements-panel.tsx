import { formatDate } from "@/lib/format";
import type { CourseAnnouncement } from "@/lib/announcements";

/**
 * The learner's copy of what the instructor sent.
 *
 * A Server Component with no interactivity: this is the channel that does not
 * depend on email, which is the whole reason sendAnnouncement commits the row
 * before it attempts a single delivery.
 */
export function AnnouncementsPanel({
  announcements,
}: {
  announcements: CourseAnnouncement[];
}) {
  if (announcements.length === 0) {
    return <p className="text-graphite">No announcements from the instructor yet.</p>;
  }

  return (
    <section aria-labelledby="announcements-heading">
      <h2 id="announcements-heading" className="sr-only">
        Announcements
      </h2>
      <ol className="flex flex-col divide-y divide-rule border-y border-rule">
        {announcements.map((announcement) => (
          <li key={announcement.id} className="flex flex-col gap-1.5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold">{announcement.subject}</h3>
              {announcement.sentAt ? (
                <time dateTime={announcement.sentAt.toISOString()} className="text-sm text-graphite">
                  {formatDate(announcement.sentAt)}
                </time>
              ) : null}
            </div>
            {/* Rendered as text, never as markup — the body is whatever the
                instructor typed, and lib/email.ts already had one escaping bug
                from treating user-supplied text as safe. */}
            <p className="text-base whitespace-pre-line text-ink">{announcement.body}</p>
            <p className="text-sm text-graphite">From {announcement.authorName}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
