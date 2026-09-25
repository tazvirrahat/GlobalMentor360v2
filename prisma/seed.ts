import "dotenv/config";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { sendAnnouncement } from "../lib/announcements";
import { grantEnrollment } from "../lib/enrollment";
import { markLectureComplete, recomputeCourseProgress, submitQuizAttempt } from "../lib/progress";
import { saveReview } from "../lib/reviews";
import { SEED_COURSES, SEED_LEARNERS, type SeedCourse, type SeedLesson } from "./seed-content";

/**
 * Idempotent development seed. Safe to re-run.
 *
 * Creates the taxonomy, the three seed accounts, the six-course catalog from
 * prisma/seed-content.ts, a handful of learners with reviews, and the sample
 * learner's journey: one course finished (with its certificate) and one in
 * progress, stopped at a section quiz.
 *
 * Every write that has a domain rule goes through the domain function
 * (grantEnrollment, markLectureComplete, submitQuizAttempt, saveReview,
 * sendAnnouncement), so seeded data obeys the same invariants as real data.
 */

// Seeding never sends mail. lib/email reads EMAIL_FROM per send, so clearing it
// here puts sign-ups and announcements on the console fallback.
process.env.EMAIL_FROM = "";

const SEED_PASSWORD = "dev-password-12345";

const CATEGORIES = [
  {
    name: "Development",
    slug: "development",
    children: [
      { name: "Web Development", slug: "web-development" },
      { name: "Data Science", slug: "data-science" },
      { name: "Mobile Development", slug: "mobile-development" },
    ],
  },
  {
    name: "Business",
    slug: "business",
    children: [
      { name: "Entrepreneurship", slug: "entrepreneurship" },
      { name: "Management", slug: "management" },
      { name: "Office Productivity", slug: "office-productivity" },
      { name: "Career Skills", slug: "career-skills" },
    ],
  },
  {
    name: "Design",
    slug: "design",
    children: [
      { name: "Web Design", slug: "web-design" },
      { name: "UX Design", slug: "ux-design" },
    ],
  },
];

const TOPICS = ["TypeScript", "React", "PostgreSQL", "Product Management", "Figma"];
const SKILLS = ["Frontend Development", "Database Design", "API Design", "User Research"];

async function seedTaxonomy() {
  for (const [index, parent] of CATEGORIES.entries()) {
    const created = await db.category.upsert({
      where: { slug: parent.slug },
      update: { name: parent.name, position: index },
      create: { name: parent.name, slug: parent.slug, position: index },
    });

    for (const [childIndex, child] of parent.children.entries()) {
      await db.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: created.id, position: childIndex },
        create: {
          name: child.name,
          slug: child.slug,
          parentId: created.id,
          position: childIndex,
        },
      });
    }
  }

  for (const name of TOPICS) {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    await db.topic.upsert({ where: { slug }, update: { name }, create: { name, slug } });
  }

  for (const name of SKILLS) {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    await db.skill.upsert({ where: { slug }, update: { name }, create: { name, slug } });
  }
}

/**
 * Users are created through Better Auth rather than inserted directly, so the
 * password is hashed with the same scrypt parameters the sign-in path verifies
 * against. A hand-rolled INSERT here would produce accounts that cannot log in.
 */
async function ensureUser(input: {
  name: string;
  email: string;
  password: string;
  roles: ("LEARNER" | "INSTRUCTOR" | "ADMIN")[];
}) {
  const existing = await db.user.findUnique({ where: { email: input.email } });

  if (!existing) {
    await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
    });
  }

  const user = await db.user.findUniqueOrThrow({ where: { email: input.email } });

  for (const role of input.roles) {
    await db.userRole.upsert({
      where: { userId_role: { userId: user.id, role } },
      update: {},
      create: { userId: user.id, role },
    });
  }

  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });

  return user;
}

/**
 * Idempotent "this course costs X in currency Y".
 *
 * There is no compound unique key to upsert on any more: "at most one active
 * price per course per currency" is a partial unique index (migration
 * 20260807000002), which Prisma cannot address in a `where`. Reseeding must stay
 * idempotent, so find-then-write rather than upsert.
 */
async function setPrice(courseId: string, currency: string, amount: number) {
  const existing = await db.price.findFirst({
    where: { courseId, currency, isActive: true },
    select: { id: true },
  });

  if (existing) {
    await db.price.update({ where: { id: existing.id }, data: { amount } });
    return;
  }

  await db.price.create({ data: { courseId, currency, amount, isActive: true } });
}

function curriculumItemData(sectionId: string, position: number, lesson: SeedLesson) {
  if (lesson.kind === "article") {
    return {
      sectionId,
      position,
      type: "LECTURE" as const,
      title: lesson.title,
      isPreview: Boolean(lesson.preview), // free preview — the conversion path
      lecture: {
        create: {
          contentType: "ARTICLE" as const,
          articleBody: lesson.body,
          durationSeconds: lesson.minutes * 60,
        },
      },
    };
  }

  return {
    sectionId,
    position,
    type: "QUIZ" as const,
    title: lesson.title,
    assessment: {
      create: {
        type: "QUIZ" as const,
        passThresholdPct: lesson.passPct,
        questions: {
          create: lesson.questions.map((question, questionIndex) => ({
            prompt: question.prompt,
            type: question.type,
            position: questionIndex,
            explanation: question.explanation,
            options: {
              create: question.options.map((option, optionIndex) => ({
                text: option.text,
                isCorrect: option.correct,
                position: optionIndex,
              })),
            },
          })),
        },
      },
    },
  };
}

async function replaceTextList(
  model: "courseObjective" | "courseRequirement" | "courseTargetAudience",
  courseId: string,
  items: string[],
) {
  const rows = items.map((text, position) => ({ courseId, text, position }));
  // Three delegates with the same shape; a switch keeps each call fully typed.
  switch (model) {
    case "courseObjective":
      await db.courseObjective.deleteMany({ where: { courseId } });
      await db.courseObjective.createMany({ data: rows });
      return;
    case "courseRequirement":
      await db.courseRequirement.deleteMany({ where: { courseId } });
      await db.courseRequirement.createMany({ data: rows });
      return;
    case "courseTargetAudience":
      await db.courseTargetAudience.deleteMany({ where: { courseId } });
      await db.courseTargetAudience.createMany({ data: rows });
      return;
  }
}

async function seedCourse(spec: SeedCourse, instructorId: string) {
  const category = await db.category.findUniqueOrThrow({ where: { slug: spec.categorySlug } });
  const data = {
    title: spec.title,
    subtitle: spec.subtitle,
    description: spec.description,
    level: spec.level,
    language: "en",
    status: "PUBLISHED" as const,
    primaryCategoryId: category.id,
    instructorId,
  };

  const course = await db.course.upsert({
    where: { slug: spec.slug },
    update: data,
    create: { ...data, slug: spec.slug, publishedAt: new Date() },
  });

  // Rebuild the curriculum only when its shape changed. Deleting sections
  // cascades to curriculum items and from there to learners' item_progress,
  // so an unconditional rebuild would wipe progress on every re-seed.
  const existing = await db.curriculumItem.findMany({
    where: { section: { courseId: course.id } },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
    select: { title: true },
  });
  const wanted = spec.sections.flatMap((section) => section.lessons.map((lesson) => lesson.title));

  if (existing.map((item) => item.title).join("\n") !== wanted.join("\n")) {
    await db.section.deleteMany({ where: { courseId: course.id } });
    for (const [sectionIndex, section] of spec.sections.entries()) {
      const row = await db.section.create({
        data: { courseId: course.id, title: section.title, position: sectionIndex },
      });
      for (const [lessonIndex, lesson] of section.lessons.entries()) {
        await db.curriculumItem.create({ data: curriculumItemData(row.id, lessonIndex, lesson) });
      }
    }
  }

  await replaceTextList("courseObjective", course.id, spec.objectives);
  await replaceTextList("courseRequirement", course.id, spec.requirements);
  await replaceTextList("courseTargetAudience", course.id, spec.audience);
  await db.courseFaq.deleteMany({ where: { courseId: course.id } });
  if (spec.faqs?.length) {
    await db.courseFaq.createMany({
      data: spec.faqs.map((faq, position) => ({ courseId: course.id, ...faq, position })),
    });
  }

  await setPrice(course.id, "USD", spec.priceUsdCents);
  // bKash settles in BDT, so a course without a BDT price cannot be bought on
  // that rail at all. Priced independently rather than converted — FX drift
  // would silently change what learners are charged.
  await setPrice(course.id, "BDT", spec.priceBdtMinor);

  return course;
}

async function seedCoupon() {
  await db.coupon.upsert({
    where: { code: "SAVE10" },
    update: { isActive: true, type: "PERCENTAGE", value: 10 },
    create: {
      code: "SAVE10",
      type: "PERCENTAGE",
      value: 10,
      isActive: true,
    },
  });
}

function expectOk(result: { ok: boolean; message?: string }, what: string) {
  if (!result.ok) throw new Error(`${what}: ${result.message ?? "refused"}`);
}

/**
 * Completes the first `limit` curriculum items in order (all of them when
 * omitted), passing each quiz with the correct answers. Items already complete
 * are skipped, so re-seeding does not trip "retakes are not allowed".
 */
async function completeItems(userId: string, courseId: string, limit?: number) {
  const items = await db.curriculumItem.findMany({
    where: { section: { courseId } },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      progress: { where: { userId }, select: { completedAt: true } },
      assessment: {
        select: {
          id: true,
          attempts: { where: { userId, passed: true }, select: { id: true }, take: 1 },
          questions: {
            select: { id: true, options: { select: { id: true, isCorrect: true } } },
          },
        },
      },
    },
  });

  for (const item of items) {
    if (item.type === "LECTURE") {
      if (item.progress[0]?.completedAt) continue;
      expectOk(await markLectureComplete(userId, item.id), `complete "${item.title}"`);
    }

    if (item.type === "QUIZ" && item.assessment) {
      if (item.assessment.attempts.length > 0) continue;
      expectOk(
        await submitQuizAttempt(
          userId,
          item.assessment.id,
          item.assessment.questions.map((question) => ({
            questionId: question.id,
            selectedOptionIds: question.options.filter((o) => o.isCorrect).map((o) => o.id),
          })),
        ),
        `pass "${item.title}"`,
      );
    }
  }

  await recomputeCourseProgress(userId, courseId);
}

async function ensureEnrolled(userId: string, courseId: string) {
  // grantEnrollment is idempotent: it revives a revoked row or inserts
  // ON CONFLICT DO NOTHING, and keeps Course.enrollmentCount right (invariant 7).
  await grantEnrollment(userId, courseId, "GRANT");
}

async function main() {
  console.log("Seeding taxonomy…");
  await seedTaxonomy();

  console.log("Seeding users…");
  const instructor = await ensureUser({
    name: "Dana Instructor",
    email: "instructor@example.com",
    password: SEED_PASSWORD,
    roles: ["LEARNER", "INSTRUCTOR"],
  });

  await ensureUser({
    name: "Alex Admin",
    email: "admin@example.com",
    password: SEED_PASSWORD,
    roles: ["LEARNER", "ADMIN"],
  });

  const learner = await ensureUser({
    name: "Sam Learner",
    email: "learner@example.com",
    password: SEED_PASSWORD,
    roles: ["LEARNER"],
  });

  console.log("Seeding courses…");
  const courses = new Map<string, { id: string; title: string }>();
  for (const spec of SEED_COURSES) {
    const course = await seedCourse(spec, instructor.id);
    courses.set(spec.slug, course);
  }
  await seedCoupon();

  const bySlug = (slug: string) => {
    const course = courses.get(slug);
    if (!course) throw new Error(`Seed course ${slug} is missing from seed-content.ts`);
    return course;
  };

  console.log("Seeding the sample learner's journey…");
  // Finished course → certificate (recomputeCourseProgress issues it at 100%).
  // Not SQL for Analysts: the e2e suite buys that one as the seed learner.
  const finished = bySlug("python-basics");
  await ensureEnrolled(learner.id, finished.id);
  await completeItems(learner.id, finished.id);

  // In progress, stopped at the first section quiz, so "Continue" lands on a gate.
  const current = bySlug("typescript-foundations");
  await ensureEnrolled(learner.id, current.id);
  await completeItems(learner.id, current.id, 2);

  console.log("Seeding learners and reviews…");
  for (const person of SEED_LEARNERS) {
    const user = await ensureUser({
      name: person.name,
      email: person.email,
      password: SEED_PASSWORD,
      roles: ["LEARNER"],
    });
    for (const review of person.reviews) {
      const course = bySlug(review.courseSlug);
      await ensureEnrolled(user.id, course.id);
      const saved = await saveReview({
        userId: user.id,
        courseId: course.id,
        rating: review.rating,
        body: review.body,
      });
      if (!saved.ok) throw new Error(`review by ${person.email}: ${saved.message}`);
    }
  }

  const officeHours = "Office hours this Thursday";
  const announced = await db.announcement.findFirst({
    where: { courseId: current.id, subject: officeHours },
    select: { id: true },
  });
  if (!announced) {
    const sent = await sendAnnouncement({
      instructorId: instructor.id,
      courseId: current.id,
      subject: officeHours,
      body: "I'll be answering questions about generics and strict mode live on Thursday at 8pm Dhaka time. Post your question in the Q&A tab beforehand and I'll start with those.",
    });
    if (!sent.ok) throw new Error(`announcement: ${sent.message}`);
  }

  console.log(`Done. Seeded ${courses.size} courses and ${SEED_LEARNERS.length} reviewers.`);
  console.log(
    `Sign in as learner@example.com, instructor@example.com or admin@example.com — password ${SEED_PASSWORD}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
