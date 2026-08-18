import "dotenv/config";
import { db } from "../lib/db";
import { markLectureComplete, submitQuizAttempt } from "../lib/progress";
import { getCertificateBySerial } from "../lib/certificates";

/**
 * One-shot sanity check of the completion loop: complete every item of the
 * seeded course as the seeded learner, then confirm progress hits 100% and a
 * certificate exists and resolves by serial. Cleans up after itself.
 */
async function main() {
  const learner = await db.user.findUniqueOrThrow({
    where: { email: "learner@example.com" },
    select: { id: true },
  });
  const course = await db.course.findUniqueOrThrow({
    where: { slug: "typescript-foundations" },
    select: {
      id: true,
      sections: {
        orderBy: { position: "asc" },
        select: {
          items: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              type: true,
              title: true,
              assessment: {
                select: {
                  id: true,
                  questions: {
                    select: {
                      id: true,
                      options: { select: { id: true, isCorrect: true } },
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

  for (const section of course.sections) {
    for (const item of section.items) {
      if (item.type === "LECTURE") {
        const res = await markLectureComplete(learner.id, item.id);
        console.log(`lecture "${item.title}": ${res.ok ? "completed" : res.message}`);
      } else if (item.type === "QUIZ" && item.assessment) {
        const answers = item.assessment.questions.map((q) => ({
          questionId: q.id,
          selectedOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
        }));
        const res = await submitQuizAttempt(learner.id, item.assessment.id, answers);
        console.log(
          `quiz "${item.title}": ${res.ok ? `score ${res.scorePct}% passed=${res.passed}` : res.message}`,
        );
      }
    }
  }

  const progress = await db.courseProgress.findUnique({
    where: { userId_courseId: { userId: learner.id, courseId: course.id } },
  });
  console.log(`course progress: ${progress?.percent}% completedAt=${progress?.completedAt?.toISOString()}`);

  const cert = await db.certificate.findUnique({
    where: { userId_courseId: { userId: learner.id, courseId: course.id } },
  });
  console.log(`certificate: ${cert ? cert.serial : "MISSING"}`);

  if (cert) {
    const lookup = await getCertificateBySerial(cert.serial);
    console.log(`serial lookup: ${lookup ? `${lookup.user.name} / ${lookup.course.title}` : "FAILED"}`);
  }

  // Reset so the learner account stays fresh for manual testing.
  await db.certificate.deleteMany({ where: { userId: learner.id, courseId: course.id } });
  await db.courseProgress.deleteMany({ where: { userId: learner.id, courseId: course.id } });
  await db.quizAttempt.deleteMany({
    where: { userId: learner.id, assessment: { curriculumItem: { section: { courseId: course.id } } } },
  });
  await db.itemProgress.deleteMany({
    where: { userId: learner.id, curriculumItem: { section: { courseId: course.id } } },
  });
  // This script records lecture_completed / quiz_submitted; analytics_events has
  // no FK, so leaving them would mix verify-run debris into the seed learner.
  await db.analyticsEvent.deleteMany({
    where: {
      userId: learner.id,
      name: { in: ["lecture_completed", "quiz_submitted"] },
    },
  });
  console.log("cleaned up test progress");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
