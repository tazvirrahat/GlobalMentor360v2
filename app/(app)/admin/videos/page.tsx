import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { StatusBadge } from "@/components/course/status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatDuration } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { isVideoEventQueueConfigured, lastDrain } from "@/lib/video";
import { listVideoJobsNeedingAttention, videoStatusCounts } from "@/lib/video-jobs";
import { DrainNow, VideoJobActions } from "./video-job-actions";

export const metadata = { title: "Videos | Admin" };
export const dynamic = "force-dynamic";

const STATES = [
  ["UPLOADING", "Uploading"],
  ["PROCESSING", "Processing"],
  ["READY", "Ready"],
  ["FAILED", "Failed"],
] as const;

/** Admin › Videos: the upload and transcoding pipeline, what is stuck or failed, and the event queue. */
export default async function AdminVideosPage() {
  await requireRole("ADMIN");
  const now = new Date();
  const [counts, jobs] = await Promise.all([videoStatusCounts(), listVideoJobsNeedingAttention(now)]);
  const queueReady = isVideoEventQueueConfigured();
  const drain = lastDrain();

  return (
    <main className="flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Videos" description="Lecture videos on their way from upload to playback." />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-4">
        {STATES.map(([status, label]) => (
          <div key={status} className="flex flex-col gap-1 bg-surface p-4">
            <dt className="text-sm text-graphite">{label}</dt>
            <dd className="text-2xl font-semibold text-ink tabular-nums">{counts[status]}</dd>
          </div>
        ))}
      </dl>

      <Panel
        title="Needs attention"
        description="Failed videos, and uploads or processing that haven't moved for over an hour. Retry starts processing again from the original upload."
      >
        {jobs.length === 0 ? (
          <p className="text-graphite">Nothing stuck: every video is ready or moving along.</p>
        ) : (
          <Table className="md:min-w-[48rem]">
            <TableCaption>Videos that need attention</TableCaption>
            <colgroup>
              <col />
              <col className="hidden w-44 md:table-column" />
              <col className="w-32 md:w-56" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Video</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const label = job.lecture?.title ?? "an unattached upload";
                return (
                  <TableRow key={job.id} className="align-top">
                    <TableCell>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium break-words text-ink">{job.lecture?.title ?? "Not attached to a lecture"}</span>
                        {job.lecture ? (
                          <span className="text-sm break-words text-graphite">
                            {job.lecture.courseTitle} · {job.lecture.instructorName}
                          </span>
                        ) : null}
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-graphite md:hidden">
                          <StatusBadge kind="video" status={job.status} />
                          for {formatDuration(job.updatedAt, now)}
                        </span>
                        {job.failureReason ? (
                          <span className="text-sm break-words text-seal">{job.failureReason}</span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="flex flex-col items-start gap-1">
                        <StatusBadge kind="video" status={job.status} />
                        <span className="text-sm text-graphite">
                          for <time dateTime={job.updatedAt.toISOString()}>{formatDuration(job.updatedAt, now)}</time>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <VideoJobActions assetId={job.id} label={label} canRetry={job.status === "FAILED"} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        title="Event queue"
        description="When a video finishes or fails processing, the result waits in a queue until this site reads it. Studio pages read it as they load."
      >
        {queueReady ? (
          <>
            <p className="text-ink">
              {drain ? (
                <>
                  Last read on this server{" "}
                  <time dateTime={drain.at.toISOString()}>{formatDateTime(drain.at)}</time>
                  {drain.error ? "" : `: ${drain.applied === 1 ? "1 event applied" : `${drain.applied} events applied`}.`}
                </>
              ) : (
                "Not read on this server since it started."
              )}
            </p>
            {drain?.error ? <p className="text-sm text-seal">{drain.error}</p> : null}
            <DrainNow />
          </>
        ) : (
          <p className="text-graphite">
            The event queue isn&apos;t set up on this site, so a video&apos;s status changes only when someone checks it.
          </p>
        )}
      </Panel>
    </main>
  );
}
