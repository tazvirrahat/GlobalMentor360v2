import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * The product event stream.
 *
 * FEATURES section K makes this P0 for a reason that is easy to miss: section C
 * requires playback analytics — watch percentage, drop-off, rewatch — and
 * TECH-SPEC chose to build engagement analytics from our own events rather than
 * buy them from a video vendor. That trade only pays off if the events are
 * actually recorded, from the beginning. Events not captured today cannot be
 * backfilled tomorrow.
 *
 * Two rules make this safe to call from anywhere:
 *
 * Recording never throws. An analytics write failing must not fail the thing
 * being measured — a learner's progress must not be lost because the events
 * table was unreachable. Every call is fire-and-forget with the error logged.
 *
 * Payloads carry ids and numbers, never personal data. The `userId` column is
 * the only place a person is identified, so honouring a GDPR erasure means
 * deleting rows by `userId` rather than auditing every JSON blob for a name or
 * an email that leaked into it.
 */

/**
 * The events worth recording, named as past-tense facts.
 *
 * A closed union rather than free-form strings: an event whose name is a typo is
 * invisible to every query that looks for the correct spelling, and nothing
 * fails loudly enough for anyone to notice.
 */
export type AnalyticsEventName =
  | "course_viewed"
  | "checkout_started"
  | "enrollment_granted"
  | "lecture_started"
  | "lecture_completed"
  | "quiz_submitted"
  | "course_completed"
  | "certificate_issued";

export type AnalyticsPayload = Record<string, string | number | boolean | null>;

async function write(
  name: AnalyticsEventName,
  userId: string | null,
  payload: AnalyticsPayload,
): Promise<void> {
  try {
    await db.analyticsEvent.create({
      data: { name, userId, payload: payload as Prisma.InputJsonValue },
    });
  } catch (error) {
    // Swallowed deliberately. The alternative is a failed analytics insert
    // taking down a learner's enrollment or progress write with it.
    console.error(`analytics: failed to record ${name}`, error);
  }
}

/**
 * Records one event without blocking the response.
 *
 * Inside a request this hands the write to `after`, which Next runs once the
 * response is finished. A bare floating promise would look equivalent and is
 * not: on a serverless runtime the invocation can be frozen or killed the moment
 * the response is sent, silently dropping the event. `after` is the documented
 * primitive for exactly this — Next's own docs name analytics as the use case.
 *
 * Outside a request — tests, seeds, the scripts in scripts/ — there is no
 * response to come after, so the write is awaited inline. That also makes the
 * behaviour deterministic under test: callers `await recordEvent`, and the row
 * is there when it resolves, rather than landing at some point afterwards and
 * leaking into the next test.
 */
export async function recordEvent(
  name: AnalyticsEventName,
  userId: string | null,
  payload: AnalyticsPayload = {},
): Promise<void> {
  try {
    after(() => write(name, userId, payload));
  } catch {
    // `after` throws when there is no request scope. That is the non-request
    // case, not an error worth reporting.
    await write(name, userId, payload);
  }
}

export type EventCount = { name: string; count: number };

/** How often each event fired in a window — the shape a dashboard reads. */
export async function countEventsSince(since: Date): Promise<EventCount[]> {
  const rows = await db.analyticsEvent.groupBy({
    by: ["name"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { name: "desc" } },
  });

  return rows.map((row) => ({ name: row.name, count: row._count._all }));
}

/**
 * Deletes one person's event history.
 *
 * GDPR erasure is P1 in FEATURES section O, but the shape of the erasure is
 * decided here and now: because a person is identified only by `userId`, this is
 * one delete rather than a scan of every payload. Building the stream any other
 * way would have made erasure a migration.
 */
export async function forgetUserEvents(userId: string): Promise<number> {
  const { count } = await db.analyticsEvent.deleteMany({ where: { userId } });
  return count;
}
