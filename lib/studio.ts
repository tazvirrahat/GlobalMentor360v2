import { db } from "@/lib/db";

/**
 * Authoring-side reads and guards.
 *
 * Everything here is scoped to the signed-in instructor. Ownership is checked in
 * the query rather than after it — a findUnique followed by an `if` is one early
 * return away from leaking someone else's draft.
 */

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/** Appends -2, -3… until free. Slugs are public URLs, so collisions must not 500. */
export async function uniqueSlug(base: string): Promise<string> {
  const root = base || "course";
  let candidate = root;
  let suffix = 1;

  while (await db.course.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }

  return candidate;
}

export async function listInstructorCourses(instructorId: string) {
  return db.course.findMany({
    where: { instructorId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      updatedAt: true,
      enrollmentCount: true,
      _count: { select: { sections: true } },
    },
  });
}

/** Returns null when the course does not exist OR is not this instructor's. */
export async function getOwnedCourse(courseId: string, instructorId: string) {
  return db.course.findFirst({
    where: { id: courseId, instructorId },
    select: {
      id: true,
      title: true,
      slug: true,
      subtitle: true,
      description: true,
      level: true,
      language: true,
      status: true,
      primaryCategoryId: true,
      prices: { where: { isActive: true }, select: { currency: true, amount: true } },
    },
  });
}

export async function getOwnedCurriculum(courseId: string, instructorId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, instructorId },
    select: {
      id: true,
      title: true,
      status: true,
      sections: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          items: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              type: true,
              position: true,
              isPreview: true,
              lecture: {
                // articleBody is deliberately absent: the list renders none of it,
                // and lectureSchema caps it at 50k chars, so selecting it ships
                // megabytes per render on a large course for nothing. The item
                // editor fetches it separately.
                select: {
                  contentType: true,
                  durationSeconds: true,
                  asset: {
                    select: { id: true, status: true, failureReason: true },
                  },
                },
              },
              // The count, not the questions: the list only needs to warn about
              // an empty quiz, and pulling options here would drag isCorrect
              // through a query that does not need it.
              assessment: {
                select: { id: true, _count: { select: { questions: true } } },
              },
            },
          },
        },
      },
    },
  });

  return course;
}

/**
 * Everything the item editor page renders, for either item type, in one owned
 * query. `courseId` is part of the `where` rather than compared afterwards, so a
 * URL pairing one course with another course's item 404s instead of resolving.
 *
 * This selects `AnswerOption.isCorrect` and `AnswerOption.explanation`, neither of
 * which the learner-facing read in lib/progress.ts takes. The studio is
 * instructor-only and an author who cannot see the correct option, or the note
 * they wrote against it, cannot edit either — but nothing derived from this shape
 * may cross onto a learner path. The per-answer note is as answer-revealing as the
 * flag: "Correct — the compiler erases types" names the answer outright, so a
 * pre-submission read that added it would hand the quiz away.
 */
export async function getOwnedItemForEditing(
  courseId: string,
  itemId: string,
  instructorId: string,
) {
  return db.curriculumItem.findFirst({
    where: { id: itemId, section: { courseId, course: { instructorId } } },
    select: {
      id: true,
      title: true,
      type: true,
      isPreview: true,
      section: { select: { id: true, title: true, courseId: true } },
      lecture: {
        select: {
          id: true,
          contentType: true,
          description: true,
          articleBody: true,
          durationSeconds: true,
          asset: { select: { id: true, status: true } },
        },
      },
      assessment: {
        select: {
          id: true,
          description: true,
          timeLimitSeconds: true,
          passThresholdPct: true,
          shuffleQuestions: true,
          allowRetakes: true,
          questions: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              prompt: true,
              type: true,
              explanation: true,
              knowledgeArea: true,
              position: true,
              options: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  text: true,
                  isCorrect: true,
                  explanation: true,
                  position: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * A LECTURE curriculum item with its video asset, only if the owning course
 * belongs to this instructor. Ownership lives in the query (see file header).
 */
export async function getOwnedLectureItem(itemId: string, instructorId: string) {
  return db.curriculumItem.findFirst({
    where: { id: itemId, type: "LECTURE", section: { course: { instructorId } } },
    select: {
      id: true,
      title: true,
      section: { select: { courseId: true } },
      lecture: {
        select: {
          id: true,
          contentType: true,
          assetId: true,
          asset: {
            select: {
              id: true,
              providerAssetId: true,
              status: true,
              durationSeconds: true,
              failureReason: true,
            },
          },
        },
      },
    },
  });
}

export type ReadinessCheck = { label: string; ok: boolean; hint: string };

/**
 * What must be true before a course can go live. Publishing something with no
 * content or no price produces a listing nobody can buy or learn from.
 */
export async function readinessChecks(courseId: string): Promise<ReadinessCheck[]> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      subtitle: true,
      sections: {
        select: {
          _count: { select: { items: true } },
          items: {
            select: {
              type: true,
              assessment: { select: { _count: { select: { questions: true } } } },
            },
          },
        },
      },
      prices: { where: { isActive: true }, select: { id: true } },
    },
  });

  if (!course) return [];

  const itemCount = course.sections.reduce((sum, s) => sum + s._count.items, 0);

  // An empty quiz is a hole in the gate, not a wall. lib/progress.ts scores it
  // `total === 0 ? 100`, so submitting an empty form passes, marks the item
  // complete, unlocks everything after it, and counts toward the certificate —
  // an assessment that assesses nothing while looking like it did. A QUIZ item
  // with no assessment row at all fails this check the same way, which is the
  // right answer for a shape the player cannot render either.
  const emptyQuizzes = course.sections
    .flatMap((section) => section.items)
    .filter(
      (item) =>
        (item.type === "QUIZ" || item.type === "PRACTICE_TEST") &&
        (item.assessment?._count.questions ?? 0) === 0,
    ).length;

  return [
    {
      label: "Has a title",
      ok: course.title.trim().length > 0,
      hint: "Set a course title.",
    },
    {
      label: "Has a subtitle",
      ok: (course.subtitle ?? "").trim().length > 0,
      hint: "A subtitle is what learners read in search results.",
    },
    {
      label: "Has at least one section",
      ok: course.sections.length > 0,
      hint: "Add a section in the curriculum builder.",
    },
    {
      label: "Has at least one lecture",
      ok: itemCount > 0,
      hint: "Add a lecture to a section.",
    },
    {
      label: "Every quiz has questions",
      ok: emptyQuizzes === 0,
      hint:
        emptyQuizzes === 1
          ? "One quiz has no questions, so it auto-passes every learner and unlocks the rest of the course."
          : `${emptyQuizzes} quizzes have no questions, so they auto-pass every learner and unlock the rest of the course.`,
    },
    {
      label: "Has a price",
      ok: course.prices.length > 0,
      hint: "Set a price. Use 0 for a free course.",
    },
  ];
}
