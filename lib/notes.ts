import { db } from "@/lib/db";
import { isEnrolled } from "@/lib/entitlement";

/**
 * Lecture notes and bookmarks. Both require a live enrollment — they are study
 * tools, not a preview conversion path, so a signed-out visitor (or a refunded
 * learner) cannot write them.
 */

export type LectureNote = {
  id: string;
  timestampSeconds: number;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

async function lectureIfEnrolled(userId: string, lectureId: string) {
  const lecture = await db.lecture.findUnique({
    where: { id: lectureId },
    select: {
      id: true,
      curriculumItem: { select: { id: true, section: { select: { courseId: true } } } },
    },
  });
  if (!lecture) return null;
  if (!(await isEnrolled(userId, lecture.curriculumItem.section.courseId))) return null;
  return lecture;
}

export const NOTE_PAGE_SIZE = 100;

export type LectureNotesPage = {
  notes: LectureNote[];
  hiddenByPageSize: number;
};

export async function listNotes(userId: string, lectureId: string): Promise<LectureNotesPage> {
  const lecture = await lectureIfEnrolled(userId, lectureId);
  if (!lecture) return { notes: [], hiddenByPageSize: 0 };

  const where = { userId, lectureId };
  const [rows, total] = await Promise.all([
    db.note.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: NOTE_PAGE_SIZE,
      select: {
        id: true,
        timestampSeconds: true,
        body: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.note.count({ where }),
  ]);

  const notes = [...rows].sort(
    (a, b) => a.timestampSeconds - b.timestampSeconds || a.createdAt.getTime() - b.createdAt.getTime(),
  );

  return { notes, hiddenByPageSize: Math.max(0, total - rows.length) };
}

export async function createNote(input: {
  userId: string;
  lectureId: string;
  body: string;
  timestampSeconds: number;
}): Promise<{ ok: true; note: LectureNote } | { ok: false; message: string }> {
  const body = input.body.trim();
  if (body.length < 1) return { ok: false, message: "Write a note first." };
  if (body.length > 4000) return { ok: false, message: "Keep notes under 4000 characters." };

  const lecture = await lectureIfEnrolled(input.userId, input.lectureId);
  if (!lecture) return { ok: false, message: "Only enrolled learners can take notes." };

  const timestampSeconds = Number.isFinite(input.timestampSeconds)
    ? Math.max(0, Math.floor(input.timestampSeconds))
    : 0;

  const note = await db.note.create({
    data: {
      userId: input.userId,
      lectureId: lecture.id,
      body,
      timestampSeconds,
    },
    select: {
      id: true,
      timestampSeconds: true,
      body: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { ok: true, note };
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  await db.note.deleteMany({ where: { id: noteId, userId } });
}

export async function isBookmarked(userId: string, curriculumItemId: string): Promise<boolean> {
  const row = await db.bookmark.findUnique({
    where: { userId_curriculumItemId: { userId, curriculumItemId } },
    select: { userId: true },
  });
  return row !== null;
}

export async function toggleBookmark(
  userId: string,
  curriculumItemId: string,
): Promise<{ ok: true; bookmarked: boolean } | { ok: false; message: string }> {
  const item = await db.curriculumItem.findUnique({
    where: { id: curriculumItemId },
    select: { id: true, section: { select: { courseId: true } } },
  });
  if (!item) return { ok: false, message: "Lesson not found." };
  if (!(await isEnrolled(userId, item.section.courseId))) {
    return { ok: false, message: "Only enrolled learners can bookmark lessons." };
  }

  const existing = await db.bookmark.findUnique({
    where: { userId_curriculumItemId: { userId, curriculumItemId } },
    select: { userId: true },
  });

  if (existing) {
    await db.bookmark.delete({
      where: { userId_curriculumItemId: { userId, curriculumItemId } },
    });
    return { ok: true, bookmarked: false };
  }

  await db.bookmark.create({ data: { userId, curriculumItemId } });
  return { ok: true, bookmarked: true };
}
