import { Megaphone } from "lucide-react";
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
  if (announcements.length === 0) return null;

  return (
    <section aria-labelledby="announcements-heading" className="rounded-2xl border p-5">
      <h2
        id="announcements-heading"
        className="flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <Megaphone className="size-5 text-brand" aria-hidden />
        Announcements
      </h2>

      <ol className="mt-4 flex flex-col divide-y">
        {announcements.map((announcement) => (
          <li key={announcement.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{announcement.subject}</h3>
              {announcement.sentAt ? (
                <time
                  dateTime={announcement.sentAt.toISOString()}
                  className="text-xs text-muted-foreground"
                >
                  {announcement.sentAt.toLocaleDateString("en-GB")}
                </time>
              ) : null}
            </div>
            {/* Rendered as text, never as markup — the body is whatever the
                instructor typed, and lib/email.ts already had one escaping bug
                from treating user-supplied text as safe. */}
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {announcement.body}
            </p>
            <p className="text-xs text-muted-foreground">— {announcement.authorName}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
