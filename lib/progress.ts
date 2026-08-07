import { db } from "@/lib/db";
import { issueCertificateIfComplete } from "@/lib/certificates";
import { canPlayItem, isEnrolled } from "@/lib/entitlement";

/**
 * Progress, sequential unlock, and quiz grading.
 *
 * INVARIANT 2: CourseProgress is a derived rollup. Every write that changes
 * ItemProgress or a QuizAttempt must call recomputeCourseProgress; the percent
 * is never edited by hand.
 *
 * Sequential unlock: an item is playable only when every earlier required item
 * (across sections, by section.position then item.position) is complete. Preview
 * items remain playable via canPlayItem regardless, but completing them still
 * follows the same ItemProgress path.
 */

const LECTURE_COMPLETE_RATIO = 0.9;
const DEFAULT_PASS_THRESHOLD = 70;

export type PlayerItem = {
  id: string;
  title: string;
  type: string;
  position: number;
  isPreview: boolean;
  locked: boolean;
  completed: boolean;
  lecture: {
    id: string;
    contentType: string;
    articleBody: string | null;
    durationSeconds: number;
    asset: {
      id: string;
      providerAssetId: string | null;
      status: string;
    } | null;
  } | null;
  assessment: {
    id: string;
    passThresholdPct: number | null;
    allowRetakes: boolean;
    questions: {
      id: string;
      prompt: string;
      type: string;
      explanation: string | null;
      position: number;
      options: { id: string; text: string; position: number }[];
    }[];
    latestAttempt: {
      id: string;
      scorePct: number | null;
      passed: boolean | null;
      submittedAt: Date | null;
    } | null;
  } | null;
  progress: {
    lastPositionSeconds: number;
    watchedSeconds: number;
    completedAt: Date | null;
  } | null;
};

export type PlayerCourse = {
  id: string;
  title: string;
  slug: string;
  enrolled: boolean;
  percent: number;
  completedAt: Date | null;
  certificateSerial: string | null;
  sections: {
    id: string;
    title: string;
    position: number;
    items: PlayerItem[];
  }[];
  orderedItemIds: string[];
};

function isItemComplete(item: {
  type: string;
  progress: { completedAt: Date | null } | null;
  assessment: { latestAttempt: { passed: boolean | null } | null } | null;
}): boolean {
  if (item.type === "QUIZ" || item.type === "PRACTICE_TEST") {
    return item.assessment?.latestAttempt?.passed === true;
  }
  return item.progress?.completedAt !== null && item.progress?.completedAt !== undefined;
}

export async function getPlayerCourse(
  slug: string,
  userId: string | null,
): Promise<PlayerCourse | null> {
  const course = await db.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
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
                select: {
                  id: true,
                  contentType: true,
                  articleBody: true,
                  durationSeconds: true,
                  asset: {
                    select: { id: true, providerAssetId: true, status: true },
                  },
                },
              },
              assessment: {
                select: {
                  id: true,
                  passThresholdPct: true,
                  allowRetakes: true,
                  questions: {
                    orderBy: { position: "asc" },
                    select: {
                      id: true,
                      prompt: true,
                      type: true,
                      explanation: true,
                      position: true,
                      options: {
                        orderBy: { position: "asc" },
                        // isCorrect is NEVER sent to the client — grading is server-side.
                        select: { id: true, text: true, position: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!course) return null;

  const enrolled = userId ? await isEnrolled(userId, course.id) : false;
  const allItemIds = course.sections.flatMap((s) => s.items.map((i) => i.id));

  const [progressRows, attemptRows, courseProgress, certificate] = await Promise.all([
    userId
      ? db.itemProgress.findMany({
          where: { userId, curriculumItemId: { in: allItemIds } },
          select: {
            curriculumItemId: true,
            lastPositionSeconds: true,
            watchedSeconds: true,
            completedAt: true,
          },
        })
      : Promise.resolve([]),
    userId
      ? db.quizAttempt.findMany({
          where: {
            userId,
            assessment: { curriculumItemId: { in: allItemIds } },
            submittedAt: { not: null },
          },
          orderBy: { submittedAt: "desc" },
          select: {
            id: true,
            assessmentId: true,
            scorePct: true,
            passed: true,
            submittedAt: true,
          },
        })
      : Promise.resolve([]),
    userId
      ? db.courseProgress.findUnique({
          where: { userId_courseId: { userId, courseId: course.id } },
          select: { percent: true, completedAt: true },
        })
      : Promise.resolve(null),
    userId
      ? db.certificate.findUnique({
          where: { userId_courseId: { userId, courseId: course.id } },
          select: { serial: true },
        })
      : Promise.resolve(null),
  ]);

  const progressByItem = new Map(progressRows.map((row) => [row.curriculumItemId, row]));
  const latestAttemptByAssessment = new Map<string, (typeof attemptRows)[number]>();
  for (const attempt of attemptRows) {
    if (!latestAttemptByAssessment.has(attempt.assessmentId)) {
      latestAttemptByAssessment.set(attempt.assessmentId, attempt);
    }
  }

  // Build a provisional list so we can compute sequential locks.
  type Provisional = {
    id: string;
    type: string;
    isPreview: boolean;
    progress: { completedAt: Date | null } | null;
    assessment: { latestAttempt: { passed: boolean | null } | null } | null;
  };

  const provisional: Provisional[] = [];
  for (const section of course.sections) {
    for (const item of section.items) {
      const progress = progressByItem.get(item.id) ?? null;
      const latest = item.assessment
        ? (latestAttemptByAssessment.get(item.assessment.id) ?? null)
        : null;
      provisional.push({
        id: item.id,
        type: item.type,
        isPreview: item.isPreview,
        progress,
        assessment: item.assessment ? { latestAttempt: latest } : null,
      });
    }
  }

  const lockedIds = new Set<string>();
  let gateOpen = true;
  for (const item of provisional) {
    if (!gateOpen && !item.isPreview) {
      lockedIds.add(item.id);
    }
    // Completing this item opens the next; failing / incomplete keeps the gate shut.
    if (!isItemComplete(item)) {
      gateOpen = false;
    }
  }

  const sections = course.sections.map((section) => ({
    id: section.id,
    title: section.title,
    position: section.position,
    items: section.items.map((item): PlayerItem => {
      const progress = progressByItem.get(item.id) ?? null;
      const latest = item.assessment
        ? (latestAttemptByAssessment.get(item.assessment.id) ?? null)
        : null;
      const completed = isItemComplete({
        type: item.type,
        progress,
        assessment: item.assessment ? { latestAttempt: latest } : null,
      });

      return {
        id: item.id,
        title: item.title,
        type: item.type,
        position: item.position,
        isPreview: item.isPreview,
        locked: lockedIds.has(item.id),
        completed,
        lecture: item.lecture,
        assessment: item.assessment
          ? {
              id: item.assessment.id,
              passThresholdPct: item.assessment.passThresholdPct,
              allowRetakes: item.assessment.allowRetakes,
              questions: item.assessment.questions,
              latestAttempt: latest
                ? {
                    id: latest.id,
                    scorePct: latest.scorePct,
                    passed: latest.passed,
                    submittedAt: latest.submittedAt,
                  }
                : null,
            }
          : null,
        progress: progress
          ? {
              lastPositionSeconds: progress.lastPositionSeconds,
              watchedSeconds: progress.watchedSeconds,
              completedAt: progress.completedAt,
            }
          : null,
      };
    }),
  }));

  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    enrolled,
    percent: courseProgress?.percent ?? 0,
    completedAt: courseProgress?.completedAt ?? null,
    certificateSerial: certificate?.serial ?? null,
    sections,
    orderedItemIds: provisional.map((item) => item.id),
  };
}

/**
 * Whether the user may open this item right now. Combines entitlement
 * (enrollment / preview) with sequential unlock.
 */
export async function canAccessPlayerItem(
  userId: string | null,
  course: PlayerCourse,
  itemId: string,
): Promise<boolean> {
  const item = course.sections.flatMap((s) => s.items).find((i) => i.id === itemId);
  if (!item) return false;
  if (item.locked) return false;

  const decision = await canPlayItem(userId, itemId);
  return decision.allowed;
}

export async function recomputeCourseProgress(userId: string, courseId: string) {
  const sections = await db.section.findMany({
    where: { courseId },
    orderBy: { position: "asc" },
    select: {
      position: true,
      items: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          type: true,
          position: true,
          assessment: { select: { id: true } },
        },
      },
    },
  });

  const items = sections
    .slice()
    .sort((a, b) => a.position - b.position)
    .flatMap((section) =>
      section.items.slice().sort((a, b) => a.position - b.position),
    );
  const total = items.length;
  if (total === 0) {
    await db.courseProgress.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: { percent: 0, completedAt: null },
      create: { userId, courseId, percent: 0 },
    });
    return { percent: 0, completedAt: null as Date | null };
  }

  const itemIds = items.map((item) => item.id);
  const assessmentIds = items
    .map((item) => item.assessment?.id)
    .filter((id): id is string => Boolean(id));

  const [progressRows, passedAttempts] = await Promise.all([
    db.itemProgress.findMany({
      where: { userId, curriculumItemId: { in: itemIds }, completedAt: { not: null } },
      select: { curriculumItemId: true },
    }),
    assessmentIds.length > 0
      ? db.quizAttempt.findMany({
          where: { userId, assessmentId: { in: assessmentIds }, passed: true },
          select: { assessmentId: true },
          distinct: ["assessmentId"],
        })
      : Promise.resolve([]),
  ]);

  const completedLectures = new Set(progressRows.map((row) => row.curriculumItemId));
  const passedAssessments = new Set(passedAttempts.map((row) => row.assessmentId));

  let completed = 0;
  for (const item of items) {
    if (item.type === "QUIZ" || item.type === "PRACTICE_TEST") {
      if (item.assessment && passedAssessments.has(item.assessment.id)) completed += 1;
    } else if (completedLectures.has(item.id)) {
      completed += 1;
    }
  }

  const percent = Math.round((completed / total) * 1000) / 10;
  const completedAt = percent >= 100 ? new Date() : null;

  await db.courseProgress.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {
      percent,
      // Set completedAt the first time we cross 100; clear it if the course
      // later grows and percent drops below 100.
      completedAt,
    },
    create: { userId, courseId, percent, completedAt },
  });

  if (percent >= 100) {
    await issueCertificateIfComplete(userId, courseId);
  }

  return { percent, completedAt };
}

async function courseIdForItem(curriculumItemId: string): Promise<string | null> {
  const item = await db.curriculumItem.findUnique({
    where: { id: curriculumItemId },
    select: { section: { select: { courseId: true } } },
  });
  return item?.section.courseId ?? null;
}

export async function markLectureComplete(userId: string, curriculumItemId: string) {
  const item = await db.curriculumItem.findUnique({
    where: { id: curriculumItemId },
    select: {
      type: true,
      section: { select: { courseId: true } },
    },
  });
  if (!item || item.type !== "LECTURE") {
    return { ok: false as const, message: "Not a lecture." };
  }

  const enrolled = await isEnrolled(userId, item.section.courseId);
  if (!enrolled) {
    // Previews are playable without enrollment, but completing them still
    // requires being enrolled — otherwise we'd invent progress for tourists.
    return { ok: false as const, message: "Enrol to track progress." };
  }

  await db.itemProgress.upsert({
    where: { userId_curriculumItemId: { userId, curriculumItemId } },
    update: { completedAt: new Date() },
    create: { userId, curriculumItemId, completedAt: new Date() },
  });

  await recomputeCourseProgress(userId, item.section.courseId);
  return { ok: true as const };
}

export async function updateWatchPosition(
  userId: string,
  curriculumItemId: string,
  positionSeconds: number,
  watchedSeconds: number,
) {
  const item = await db.curriculumItem.findUnique({
    where: { id: curriculumItemId },
    select: {
      type: true,
      section: { select: { courseId: true } },
      lecture: { select: { durationSeconds: true } },
    },
  });
  if (!item || item.type !== "LECTURE" || !item.lecture) {
    return { ok: false as const, message: "Not a video lecture." };
  }

  const enrolled = await isEnrolled(userId, item.section.courseId);
  if (!enrolled) return { ok: false as const, message: "Enrol to track progress." };

  const duration = item.lecture.durationSeconds;
  const shouldComplete =
    duration > 0 && watchedSeconds >= Math.floor(duration * LECTURE_COMPLETE_RATIO);

  const existing = await db.itemProgress.findUnique({
    where: { userId_curriculumItemId: { userId, curriculumItemId } },
    select: { completedAt: true, watchedSeconds: true },
  });

  await db.itemProgress.upsert({
    where: { userId_curriculumItemId: { userId, curriculumItemId } },
    update: {
      lastPositionSeconds: Math.max(0, Math.floor(positionSeconds)),
      // Watched seconds only grow — scrubbing backwards must not erase credit.
      watchedSeconds: Math.max(existing?.watchedSeconds ?? 0, Math.floor(watchedSeconds)),
      ...(shouldComplete && !existing?.completedAt ? { completedAt: new Date() } : {}),
    },
    create: {
      userId,
      curriculumItemId,
      lastPositionSeconds: Math.max(0, Math.floor(positionSeconds)),
      watchedSeconds: Math.max(0, Math.floor(watchedSeconds)),
      completedAt: shouldComplete ? new Date() : null,
    },
  });

  if (shouldComplete) {
    await recomputeCourseProgress(userId, item.section.courseId);
  }

  return { ok: true as const, completed: shouldComplete || Boolean(existing?.completedAt) };
}

export type QuizSubmission = {
  questionId: string;
  selectedOptionIds: string[];
};

export async function submitQuizAttempt(
  userId: string,
  assessmentId: string,
  answers: QuizSubmission[],
) {
  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      passThresholdPct: true,
      allowRetakes: true,
      curriculumItemId: true,
      curriculumItem: {
        select: {
          section: { select: { courseId: true } },
        },
      },
      questions: {
        select: {
          id: true,
          type: true,
          explanation: true,
          options: { select: { id: true, isCorrect: true } },
        },
      },
    },
  });

  if (!assessment) return { ok: false as const, message: "Quiz not found." };

  const courseId = assessment.curriculumItem.section.courseId;
  if (!(await isEnrolled(userId, courseId))) {
    return { ok: false as const, message: "Enrol to take this quiz." };
  }

  if (!assessment.allowRetakes) {
    const priorPass = await db.quizAttempt.findFirst({
      where: { userId, assessmentId, passed: true },
      select: { id: true },
    });
    if (priorPass) {
      return { ok: false as const, message: "Retakes are not allowed for this quiz." };
    }
  }

  const answersByQuestion = new Map(answers.map((a) => [a.questionId, a.selectedOptionIds]));
  let correctCount = 0;

  const graded = assessment.questions.map((question) => {
    const selected = new Set(answersByQuestion.get(question.id) ?? []);
    const correctIds = new Set(
      question.options.filter((option) => option.isCorrect).map((option) => option.id),
    );

    // Exact set match: MULTI_SELECT requires every correct option and no extras.
    const isCorrect =
      selected.size === correctIds.size && [...selected].every((id) => correctIds.has(id));

    if (isCorrect) correctCount += 1;

    return {
      questionId: question.id,
      selectedOptionIds: [...selected],
      isCorrect,
      explanation: question.explanation,
      correctOptionIds: [...correctIds],
    };
  });

  const total = assessment.questions.length;
  const scorePct = total === 0 ? 100 : Math.round((correctCount / total) * 1000) / 10;
  const threshold = assessment.passThresholdPct ?? DEFAULT_PASS_THRESHOLD;
  const passed = scorePct >= threshold;

  const attempt = await db.quizAttempt.create({
    data: {
      userId,
      assessmentId,
      submittedAt: new Date(),
      scorePct,
      passed,
      answers: {
        create: graded.map((g) => ({
          questionId: g.questionId,
          selectedOptionIds: g.selectedOptionIds,
          isCorrect: g.isCorrect,
        })),
      },
    },
    select: { id: true },
  });

  if (passed) {
    await db.itemProgress.upsert({
      where: {
        userId_curriculumItemId: {
          userId,
          curriculumItemId: assessment.curriculumItemId,
        },
      },
      update: { completedAt: new Date() },
      create: {
        userId,
        curriculumItemId: assessment.curriculumItemId,
        completedAt: new Date(),
      },
    });
  }

  await recomputeCourseProgress(userId, courseId);

  return {
    ok: true as const,
    attemptId: attempt.id,
    scorePct,
    passed,
    threshold,
    results: graded,
  };
}

export { courseIdForItem };
