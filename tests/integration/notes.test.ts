import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Notes and bookmarks are enrollment-gated on the write, not merely hidden in
 * the player. A refunded learner still has a session and a leftover form; the
 * action has to refuse without help from the page.
 */

const hoisted = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () =>
    hoisted.userId
      ? { id: hoisted.userId, email: "notes@example.test", name: "Notes User" }
      : null,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { addNoteAction, toggleBookmarkAction } = await import("@/app/learn/[slug]/note-actions");
const { createNote, listNotes, toggleBookmark } = await import("@/lib/notes");
const { db } = await import("@/lib/db");
const { grantEnrollment, revokeEnrollment } = await import("@/lib/enrollment");

const run = randomUUID().slice(0, 8);
let instructorId: string;
let learnerId: string;
let outsiderId: string;
let courseId: string;
let lectureId: string;
let itemId: string;

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeAll(async () => {
  instructorId = (
    await db.user.create({
      data: { name: `Notes Instructor ${run}`, email: `notes-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  learnerId = (
    await db.user.create({
      data: { name: `Notes Learner ${run}`, email: `notes-learner-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  outsiderId = (
    await db.user.create({
      data: { name: `Notes Outsider ${run}`, email: `notes-out-${run}@example.test` },
      select: { id: true },
    })
  ).id;

  const course = await db.course.create({
    data: {
      title: `Notes Course ${run}`,
      slug: `notes-course-${run}`,
      status: "PUBLISHED",
      instructorId,
      publishedAt: new Date(),
      sections: {
        create: {
          title: "One",
          position: 0,
          items: {
            create: {
              type: "LECTURE",
              title: "Lecture",
              position: 0,
              isPreview: true,
              lecture: {
                create: { contentType: "ARTICLE", articleBody: "Hello", durationSeconds: 60 },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      sections: {
        select: {
          items: {
            select: { id: true, lecture: { select: { id: true } } },
          },
        },
      },
    },
  });

  courseId = course.id;
  itemId = course.sections[0]!.items[0]!.id;
  lectureId = course.sections[0]!.items[0]!.lecture!.id;

  await grantEnrollment(learnerId, courseId, "GRANT");
});

afterAll(async () => {
  await db.note.deleteMany({ where: { userId: { in: [learnerId, outsiderId] } } });
  await db.bookmark.deleteMany({ where: { userId: { in: [learnerId, outsiderId] } } });
  await db.analyticsEvent.deleteMany({
    where: { userId: { in: [learnerId, outsiderId, instructorId] } },
  });
  await db.enrollment.deleteMany({ where: { courseId } });
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: { in: [learnerId, outsiderId, instructorId] } } });
  await db.$disconnect();
});

describe("lib/notes enrollment gate", () => {
  it("lets an enrolled learner write a note and bookmark a lesson", async () => {
    const note = await createNote({
      userId: learnerId,
      lectureId,
      body: "Remember the structural typing example.",
      timestampSeconds: 12,
    });
    expect(note.ok).toBe(true);

    const listed = await listNotes(learnerId, lectureId);
    expect(listed.notes.map((row) => row.body)).toContain("Remember the structural typing example.");

    const bookmarked = await toggleBookmark(learnerId, itemId);
    expect(bookmarked).toEqual({ ok: true, bookmarked: true });
    expect(await toggleBookmark(learnerId, itemId)).toEqual({ ok: true, bookmarked: false });
  });

  it("refuses an outsider who is not enrolled", async () => {
    const note = await createNote({
      userId: outsiderId,
      lectureId,
      body: "Should not land.",
      timestampSeconds: 0,
    });
    expect(note.ok).toBe(false);
    expect(await listNotes(outsiderId, lectureId)).toEqual({ notes: [], hiddenByPageSize: 0 });

    const bookmark = await toggleBookmark(outsiderId, itemId);
    expect(bookmark.ok).toBe(false);
    expect(
      await db.bookmark.findUnique({
        where: { userId_curriculumItemId: { userId: outsiderId, curriculumItemId: itemId } },
      }),
    ).toBeNull();
  });

  it("refuses after enrollment is revoked", async () => {
    await revokeEnrollment(learnerId, courseId);

    const note = await createNote({
      userId: learnerId,
      lectureId,
      body: "After refund.",
      timestampSeconds: 0,
    });
    expect(note.ok).toBe(false);

    const bookmark = await toggleBookmark(learnerId, itemId);
    expect(bookmark.ok).toBe(false);

    await grantEnrollment(learnerId, courseId, "GRANT");
  });
});

describe("note-actions enrollment gate", () => {
  it("does not insert a note or bookmark from a leftover form after revoke", async () => {
    await revokeEnrollment(learnerId, courseId);
    hoisted.userId = learnerId;

    const notesBefore = await db.note.count({ where: { userId: learnerId } });
    const bookmarksBefore = await db.bookmark.count({ where: { userId: learnerId } });
    await addNoteAction(
      form({
        lectureId,
        slug: `notes-course-${run}`,
        itemId,
        body: "Crafted post after refund.",
        timestampSeconds: "0",
      }),
    );
    expect(await db.note.count({ where: { userId: learnerId } })).toBe(notesBefore);

    await toggleBookmarkAction(form({ itemId, slug: `notes-course-${run}` }));
    expect(await db.bookmark.count({ where: { userId: learnerId } })).toBe(bookmarksBefore);

    hoisted.userId = "";
    await grantEnrollment(learnerId, courseId, "GRANT");
  });
});
