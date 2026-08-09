import "dotenv/config";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { grantEnrollment } from "../lib/enrollment";

/**
 * Idempotent development seed. Safe to re-run.
 *
 * Creates the taxonomy, two staff accounts, and one published course with a real
 * curriculum so later features have something to render against.
 */

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

async function seedCourse(instructorId: string) {
  const category = await db.category.findUniqueOrThrow({ where: { slug: "web-development" } });

  const course = await db.course.upsert({
    where: { slug: "typescript-foundations" },
    update: {},
    create: {
      title: "TypeScript Foundations",
      slug: "typescript-foundations",
      subtitle: "Types, generics, and the compiler settings that actually matter.",
      description:
        "A practical introduction to TypeScript for developers who already write JavaScript.",
      level: "BEGINNER",
      language: "en",
      status: "PUBLISHED",
      primaryCategoryId: category.id,
      instructorId,
      publishedAt: new Date(),
    },
  });

  // Re-seeding should not stack duplicate curriculum rows on the same positions.
  await db.section.deleteMany({ where: { courseId: course.id } });

  const intro = await db.section.create({
    data: { courseId: course.id, title: "Getting started", position: 0 },
  });

  await db.curriculumItem.create({
    data: {
      sectionId: intro.id,
      type: "LECTURE",
      title: "Why TypeScript",
      position: 0,
      isPreview: true, // free preview — the conversion path
      lecture: {
        create: {
          contentType: "ARTICLE",
          articleBody: "Placeholder article body.",
          durationSeconds: 180,
        },
      },
    },
  });

  await db.curriculumItem.create({
    data: {
      sectionId: intro.id,
      type: "LECTURE",
      title: "Setting up the compiler",
      position: 1,
      lecture: {
        create: { contentType: "ARTICLE", articleBody: "Placeholder.", durationSeconds: 420 },
      },
    },
  });

  const types = await db.section.create({
    data: { courseId: course.id, title: "The type system", position: 1 },
  });

  await db.curriculumItem.create({
    data: {
      sectionId: types.id,
      type: "LECTURE",
      title: "Structural typing",
      position: 0,
      lecture: {
        create: { contentType: "ARTICLE", articleBody: "Placeholder.", durationSeconds: 600 },
      },
    },
  });

  await db.curriculumItem.create({
    data: {
      sectionId: types.id,
      type: "QUIZ",
      title: "Check your understanding",
      position: 1,
      assessment: {
        create: {
          type: "QUIZ",
          passThresholdPct: 70,
          questions: {
            create: [
              {
                prompt: "TypeScript's type system is primarily…",
                type: "SINGLE_CHOICE",
                position: 0,
                explanation: "Compatibility is decided by shape, not by declared inheritance.",
                options: {
                  create: [
                    { text: "Structural", isCorrect: true, position: 0 },
                    { text: "Nominal", isCorrect: false, position: 1 },
                    { text: "Dynamic", isCorrect: false, position: 2 },
                  ],
                },
              },
              {
                prompt: "`strict` in tsconfig enables noImplicitAny.",
                type: "TRUE_FALSE",
                position: 1,
                options: {
                  create: [
                    { text: "True", isCorrect: true, position: 0 },
                    { text: "False", isCorrect: false, position: 1 },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  });

  await setPrice(course.id, "USD", 4900);

  // bKash settles in BDT, so a course without a BDT price cannot be bought on
  // that rail at all. Priced independently rather than converted — FX drift
  // would silently change what learners are charged.
  await setPrice(course.id, "BDT", 599000);

  return course;
}

async function main() {
  console.log("Seeding taxonomy…");
  await seedTaxonomy();

  console.log("Seeding users…");
  const instructor = await ensureUser({
    name: "Dana Instructor",
    email: "instructor@example.com",
    password: "dev-password-12345",
    roles: ["LEARNER", "INSTRUCTOR"],
  });

  await ensureUser({
    name: "Alex Admin",
    email: "admin@example.com",
    password: "dev-password-12345",
    roles: ["LEARNER", "ADMIN"],
  });

  const learner = await ensureUser({
    name: "Sam Learner",
    email: "learner@example.com",
    password: "dev-password-12345",
    roles: ["LEARNER"],
  });

  console.log("Seeding course…");
  const course = await seedCourse(instructor.id);

  // Enrol the sample learner so the critical-path E2E has something to open.
  // Routed through grantEnrollment rather than writing the row directly:
  // invariant 7 says one code path grants access, and it is also what keeps
  // Course.enrollmentCount right — seeding the row by hand left a freshly seeded
  // database already showing "0 enrolled" for a course with an enrollment.
  await grantEnrollment(learner.id, course.id, "GRANT");

  console.log(`Done. Seeded course "${course.title}" (/${course.slug}).`);
  console.log(
    "Sign in as learner@example.com, instructor@example.com or admin@example.com — password dev-password-12345",
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
