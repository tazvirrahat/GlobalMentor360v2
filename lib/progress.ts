import { db } from "@/lib/db";
import { recordEvent } from "@/lib/analytics";
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

/**
 * Reports arrive roughly every 15s while a video plays. A longer gap means the
 * learner was paused, backgrounded, or away, so we refuse to bank it as watch
 * time — otherwise idling for ten minutes would buy ten minutes of credit.
 */
const MAX_REPORT_GAP_SECONDS = 60;

/**
 * Native player speed controls top out at 2x, so honest playback can advance the
 * playhead at most twice as fast as the wall clock. Anything faster is a seek.
 */
const MAX_PLAYBACK_RATE = 2;

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

/**
 * The single definition of "this item is done", shared by the player's read model
 * and by recomputeCourseProgress.
 *
 * INVARIANT 2: the rollup must be rebuildable from scratch and land on the same
 * answer the player shows. The player used to read the *latest* attempt while the
 * rollup counted *any* passing attempt, so passing a quiz and then failing a
 * retake re-locked the sidebar while course_progress stayed at 100%. "Ever passed"
 * is the definition that survives: practising again cannot un-pass a quiz, and it
 * is the only one a background job can reproduce from history.
 */
/**
 * The assessments this learner has *ever* passed.
 *
 * Both completion readers derive their answer from this one function rather than
 * each expressing "ever passed" in its own dialect. That is deliberate: the bug
 * this replaced was the player reading the latest attempt while the rollup ran a
 * `distinct` query for any passing attempt — two implementations of one rule,
 * which agreed until a learner failed a retake. Sharing the function makes the
 * divergence unrepresentable instead of merely tested for, at the cost of the
 * rollup fetching every attempt rather than a pre-filtered set (a handful of rows
 * per learner per course).
 */
export function passedAssessmentIds(
  attempts: { assessmentId: string; passed: boolean | null }[],
): Set<string> {
  return new Set(
    attempts.filter((attempt) => attempt.passed === true).map((attempt) => attempt.assessmentId),
  );
}

export function isItemComplete(item: {
  type: string;
  lectureCompleted: boolean;
  assessmentPassed: boolean;
}): boolean {
  if (item.type === "QUIZ" || item.type === "PRACTICE_TEST") {
    return item.assessmentPassed;
  }
  return item.lectureCompleted;
}

/**
 * When the learner finished the course: the moment the last required item was
 * completed, which is the latest of the contributing timestamps.
 *
 * INVARIANT 2 in full. Two earlier versions each broke it a different way. The
 * first stamped `new Date()` on every recompute, so the date walked forward
 * forever. The second preserved whatever was already stored — better, but it made
 * the rollup depend on its own previous value, so rebuilding `course_progress`
 * from scratch (the check TECH-SPEC's verification list asks for) would stamp
 * today's date on every learner who had already finished.
 *
 * Deriving from the item timestamps is reproducible from `item_progress` and
 * `quiz_attempts` alone, and it is a truer answer besides: it dates completion to
 * when the learner actually finished, not to whenever a recompute happened to run.
 *
 * `now` is a fallback for the impossible case of a 100% course with no timestamps.
 * Dropping below 100 (the instructor added items) still clears the date.
 */
export function resolveCompletedAt(
  percent: number,
  contributingTimestamps: (Date | null)[],
  now: Date = new Date(),
): Date | null {
  if (percent < 100) return null;

  const known = contributingTimestamps.filter((value): value is Date => value !== null);
  if (known.length === 0) return now;

  return new Date(Math.max(...known.map((value) => value.getTime())));
}

/**
 * Watch credit earned by one progress report.
 *
 * `watchedSeconds` used to be whatever the browser said, so dragging the scrubber
 * to 90% completed the lecture. Credit is now metered server-side: the playhead
 * only earns what the wall clock between two reports could plausibly have
 * covered, which makes a seek worth nothing because no time passed. The first
 * report on a row has no earlier timestamp to measure against, so it only
 * establishes the baseline (the player fires one on play for exactly that).
 *
 * This is deliberately coarse rather than an interval-coverage map: it defeats
 * scrub-to-complete and costs one integer column.
 *
 * What it does NOT do is make completion proof of viewing. markLectureComplete
 * still sets completedAt on request, and the player renders a "Mark complete"
 * button for every enrolled learner — deliberately, since a lecture whose asset
 * never reported a duration can be finished no other way. So this raises the floor
 * on *accidental* completion by an honest learner; it is not a control against a
 * determined one. Describing it as the latter is the mistake PRIOR-ART warns about.
 */
export function creditWatchedSeconds(input: {
  previousWatchedSeconds: number;
  previousPositionSeconds: number;
  positionSeconds: number;
  /** Null when no prior report exists for this item. */
  secondsSinceLastReport: number | null;
  durationSeconds: number;
}): number {
  const position = Math.max(0, Math.floor(input.positionSeconds));
  // Only forward movement earns credit; scrubbing back re-covers ground already
  // paid for, and watched seconds must never shrink.
  const advance = Math.max(0, position - Math.max(0, Math.floor(input.previousPositionSeconds)));

  const window =
    input.secondsSinceLastReport === null
      ? 0
      : Math.min(Math.max(0, input.secondsSinceLastReport), MAX_REPORT_GAP_SECONDS);

  const credit = Math.min(advance, Math.floor(window * MAX_PLAYBACK_RATE));
  const total = Math.max(0, Math.floor(input.previousWatchedSeconds)) + credit;

  // A learner cannot watch more of a lecture than it contains. Duration 0 means
  // the asset has not reported one yet, so leave the total alone rather than
  // pinning it to zero.
  return input.durationSeconds > 0 ? Math.min(total, Math.floor(input.durationSeconds)) : total;
}

export async function getPlayerCourse(
  slug: string,
  userId: string | null,
): Promise<PlayerCourse | null> {
  const course = await db.course.findFirst({
    // Deliberately not filtered by status. INVARIANT 1: entitlement lives on the
    // enrollment row, and unpublishing is an authoring decision, not a refund —
    // a learner who paid keeps access after the instructor takes the course down.
    // Non-enrolled visitors are gated on status below.
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
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

  // The preview path (signed-out or non-enrolled) still only reaches published
  // courses. A DRAFT course has no enrollments, so enrollment alone is a safe gate.
  if (!enrolled && course.status !== "PUBLISHED") return null;

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
  // The latest attempt is what the quiz form replays; completion reads the
  // "ever passed" set instead, so it matches the rollup (see isItemComplete).
  const passedIds = passedAssessmentIds(attemptRows);

  // Build a provisional list so we can compute sequential locks.
  type Provisional = {
    id: string;
    type: string;
    isPreview: boolean;
    lectureCompleted: boolean;
    assessmentPassed: boolean;
  };

  const provisional: Provisional[] = [];
  for (const section of course.sections) {
    for (const item of section.items) {
      const progress = progressByItem.get(item.id) ?? null;
      provisional.push({
        id: item.id,
        type: item.type,
        isPreview: item.isPreview,
        lectureCompleted: progress?.completedAt != null,
        assessmentPassed: item.assessment ? passedIds.has(item.assessment.id) : false,
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
        lectureCompleted: progress?.completedAt != null,
        assessmentPassed: item.assessment ? passedIds.has(item.assessment.id) : false,
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

  // Timestamps come back alongside the ids because completedAt is derived from
  // them (see resolveCompletedAt) — the rollup reads no prior state of its own.
  const [progressRows, passedAttempts] = await Promise.all([
    db.itemProgress.findMany({
      where: { userId, curriculumItemId: { in: itemIds }, completedAt: { not: null } },
      select: { curriculumItemId: true, completedAt: true },
    }),
    // Deliberately unfiltered on `passed`: the "ever passed" rule lives in
    // passedAssessmentIds, and pre-filtering here would be a second copy of it.
    assessmentIds.length > 0
      ? db.quizAttempt.findMany({
          where: { userId, assessmentId: { in: assessmentIds } },
          select: { assessmentId: true, passed: true, submittedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const completedLectures = new Set(progressRows.map((row) => row.curriculumItemId));
  const passedAssessments = passedAssessmentIds(passedAttempts);

  let completed = 0;
  for (const item of items) {
    const done = isItemComplete({
      type: item.type,
      lectureCompleted: completedLectures.has(item.id),
      assessmentPassed: item.assessment ? passedAssessments.has(item.assessment.id) : false,
    });
    if (done) completed += 1;
  }

  const percent = Math.round((completed / total) * 1000) / 10;

  // Only the timestamps that actually count toward completion. A passing attempt
  // dates the quiz from when it was passed; a later failed retake contributes
  // nothing, matching passedAssessmentIds.
  const contributingTimestamps: (Date | null)[] = [
    ...progressRows.map((row) => row.completedAt),
    ...passedAttempts
      .filter((attempt) => attempt.passed === true)
      .map((attempt) => attempt.submittedAt),
  ];
  const completedAt = resolveCompletedAt(percent, contributingTimestamps);

  await db.courseProgress.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: { percent, completedAt },
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

  await recordEvent("lecture_completed", userId, {
    courseId: item.section.courseId,
    curriculumItemId,
  });

  await recomputeCourseProgress(userId, item.section.courseId);
  return { ok: true as const };
}

/**
 * Records a playback report. The client sends only where the playhead is — how
 * much of that counts as watched is decided here, so a scrubbed video cannot
 * complete itself (see creditWatchedSeconds).
 */
export async function updateWatchPosition(
  userId: string,
  curriculumItemId: string,
  positionSeconds: number,
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

  const existing = await db.itemProgress.findUnique({
    where: { userId_curriculumItemId: { userId, curriculumItemId } },
    select: {
      completedAt: true,
      watchedSeconds: true,
      lastPositionSeconds: true,
      updatedAt: true,
    },
  });

  const duration = item.lecture.durationSeconds;
  const position = Math.max(0, Math.floor(positionSeconds));
  // updatedAt is written by every report, so it is the timestamp of the previous
  // one — the wall clock we meter the playhead against.
  const watchedSeconds = creditWatchedSeconds({
    previousWatchedSeconds: existing?.watchedSeconds ?? 0,
    previousPositionSeconds: existing?.lastPositionSeconds ?? 0,
    positionSeconds: position,
    secondsSinceLastReport: existing
      ? (Date.now() - existing.updatedAt.getTime()) / 1000
      : null,
    durationSeconds: duration,
  });

  const shouldComplete =
    duration > 0 && watchedSeconds >= Math.floor(duration * LECTURE_COMPLETE_RATIO);

  await db.itemProgress.upsert({
    where: { userId_curriculumItemId: { userId, curriculumItemId } },
    update: {
      lastPositionSeconds: position,
      watchedSeconds,
      ...(shouldComplete && !existing?.completedAt ? { completedAt: new Date() } : {}),
    },
    create: {
      userId,
      curriculumItemId,
      lastPositionSeconds: position,
      watchedSeconds,
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

  // scorePct and passed are the two numbers section K's assessment analytics
  // are built from; the answers themselves stay in quiz_attempt_answers.
  await recordEvent("quiz_submitted", userId, {
    courseId,
    assessmentId,
    scorePct,
    passed,
  });

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
