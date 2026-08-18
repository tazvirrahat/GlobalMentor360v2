/**
 * Identifiable volume fixture for pagination / empty-vs-full page checks.
 *
 * Prefix: vol- on emails, slugs, and titles. Safe to wipe with:
 *   npx tsx scripts/seed-volume.ts --clean
 *
 * Leaves the rows in place after a normal run so pages can be browsed.
 * Does not touch seed accounts (learner@ / instructor@ / admin@).
 */
import "dotenv/config";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { grantEnrollment } from "../lib/enrollment";
import { issueCertificate } from "../lib/certificates";
import { recomputeCourseRating } from "../lib/reviews";
import { recomputeCourseProgress } from "../lib/progress";

// Volume signup must not call SES (sandbox + unverified vol- addresses).
process.env.EMAIL_FROM = "";

const SEED_PASSWORD = "dev-password-12345";
const VOL_LEARNER_EMAIL = "vol-learner@example.com";
const VOL_TXN_PREFIX = "VOLTXN";
const CATALOG_COUNT = 49;
const BULK_USER_COUNT = 59;
const BIG_ENROLL_COUNT = 55;
const REVIEW_COUNT = 45;
const THREAD_COUNT = 26;
const REPLY_COUNT = 60;
const LEARNER_ENROLLMENTS = 25;
const LEARNER_ORDERS = 25;
const PAID_ORDERS = 21;
const PENDING_PAYMENTS = 45;
const ANNOUNCEMENTS = 3;

const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"] as const;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function catalogSlug(n: number): string {
  return `vol-catalog-${pad(n)}`;
}

function catalogTitle(n: number): string {
  return `vol- Catalog ${pad(n)}`;
}

function bulkEmail(n: number): string {
  return `vol-user-${pad(n)}@example.com`;
}

function volPhone(n: number): string {
  return `017${String(10000000 + n).slice(-8)}`;
}

function volTxn(n: number): string {
  return `${VOL_TXN_PREFIX}${String(n).padStart(5, "0")}`;
}

async function volUserIds(): Promise<string[]> {
  const rows = await db.user.findMany({
    where: { email: { startsWith: "vol-" } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function volCourseIds(): Promise<string[]> {
  const rows = await db.course.findMany({
    where: {
      OR: [{ slug: { startsWith: "vol-" } }, { title: { startsWith: "vol-" } }],
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function cleanVolData(): Promise<void> {
  const userIds = await volUserIds();
  const courseIds = await volCourseIds();

  if (userIds.length === 0 && courseIds.length === 0) {
    console.log("No vol- rows to delete.");
    return;
  }

  console.log(`Cleaning vol- data (${userIds.length} users, ${courseIds.length} courses)…`);

  if (userIds.length > 0) {
    await db.analyticsEvent.deleteMany({ where: { userId: { in: userIds } } });
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  }

  if (courseIds.length > 0) {
    await db.threadReply.deleteMany({ where: { thread: { courseId: { in: courseIds } } } });
    await db.questionThread.deleteMany({ where: { courseId: { in: courseIds } } });
    await db.announcement.deleteMany({ where: { courseId: { in: courseIds } } });
    await db.reviewVote.deleteMany({ where: { review: { courseId: { in: courseIds } } } });
    await db.reviewResponse.deleteMany({ where: { review: { courseId: { in: courseIds } } } });
    await db.review.deleteMany({ where: { courseId: { in: courseIds } } });
    await db.courseProgress.deleteMany({ where: { courseId: { in: courseIds } } });
    await db.certificate.deleteMany({ where: { courseId: { in: courseIds } } });
    await db.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await db.couponRedemption.deleteMany({
      where: { order: { items: { some: { courseId: { in: courseIds } } } } },
    });
  }

  await db.payment.deleteMany({
    where: {
      OR: [
        userIds.length > 0 ? { userId: { in: userIds } } : undefined,
        { bkashTransactionId: { startsWith: VOL_TXN_PREFIX } },
        { stripePaymentIntentId: { startsWith: "pi_vol_" } },
        courseIds.length > 0
          ? { order: { items: { some: { courseId: { in: courseIds } } } } }
          : undefined,
      ].filter(Boolean) as object[],
    },
  });

  await db.refund.deleteMany({
    where: {
      orderItem: {
        OR: [
          courseIds.length > 0 ? { courseId: { in: courseIds } } : undefined,
          userIds.length > 0 ? { order: { userId: { in: userIds } } } : undefined,
        ].filter(Boolean) as object[],
      },
    },
  });

  await db.orderItem.deleteMany({
    where: {
      OR: [
        courseIds.length > 0 ? { courseId: { in: courseIds } } : undefined,
        userIds.length > 0 ? { order: { userId: { in: userIds } } } : undefined,
      ].filter(Boolean) as object[],
    },
  });

  await db.couponRedemption.deleteMany({
    where: {
      OR: [
        userIds.length > 0 ? { userId: { in: userIds } } : undefined,
        { coupon: { code: { startsWith: "VOL" } } },
      ].filter(Boolean) as object[],
    },
  });

  await db.order.deleteMany({
    where: {
      OR: [
        userIds.length > 0 ? { userId: { in: userIds } } : undefined,
        courseIds.length > 0 ? { items: { some: { courseId: { in: courseIds } } } } : undefined,
      ].filter(Boolean) as object[],
    },
  });

  await db.coupon.deleteMany({ where: { code: { startsWith: "VOL" } } });

  if (userIds.length > 0) {
    await db.cartItem.deleteMany({ where: { cart: { userId: { in: userIds } } } });
    await db.cart.deleteMany({ where: { userId: { in: userIds } } });
    await db.note.deleteMany({ where: { userId: { in: userIds } } });
    await db.bookmark.deleteMany({ where: { userId: { in: userIds } } });
    await db.itemProgress.deleteMany({ where: { userId: { in: userIds } } });
    await db.quizAttempt.deleteMany({ where: { userId: { in: userIds } } });
    await db.assignmentSubmission.deleteMany({ where: { userId: { in: userIds } } });
    await db.certificate.deleteMany({ where: { userId: { in: userIds } } });
    await db.enrollment.deleteMany({ where: { userId: { in: userIds } } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.account.deleteMany({ where: { userId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  }

  if (courseIds.length > 0) {
    await db.section.deleteMany({ where: { courseId: { in: courseIds } } });
    await db.course.deleteMany({ where: { id: { in: courseIds } } });
  }

  if (userIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }

  console.log("vol- data removed.");
}

async function ensureVolLearner() {
  const existing = await db.user.findUnique({ where: { email: VOL_LEARNER_EMAIL } });
  if (!existing) {
    await auth.api.signUpEmail({
      body: { name: "Vol Learner", email: VOL_LEARNER_EMAIL, password: SEED_PASSWORD },
    });
  }
  const user = await db.user.findUniqueOrThrow({ where: { email: VOL_LEARNER_EMAIL } });
  await db.userRole.upsert({
    where: { userId_role: { userId: user.id, role: "LEARNER" } },
    update: {},
    create: { userId: user.id, role: "LEARNER" },
  });
  await db.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  return user;
}

async function ensureBulkUsers() {
  const data = Array.from({ length: BULK_USER_COUNT }, (_, index) => {
    const n = index + 1;
    return {
      name: `vol- User ${pad(n)}`,
      email: bulkEmail(n),
      emailVerified: true,
    };
  });
  await db.user.createMany({ data, skipDuplicates: true });
  const users = await db.user.findMany({
    where: { email: { startsWith: "vol-user-" } },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });
  await db.userRole.createMany({
    data: users.map((user) => ({ userId: user.id, role: "LEARNER" as const })),
    skipDuplicates: true,
  });
  return users;
}

async function addCurriculum(courseId: string, opts: { big: boolean }) {
  const section = await db.section.create({
    data: { courseId, title: opts.big ? "vol- Big section" : "vol- Section", position: 0 },
  });

  const bodies = opts.big
    ? ["VOL_CURRENT_BODY_A — unique current-item marker.", "VOL_CURRENT_BODY_B — must not leak into item 1 HTML.", "VOL_CURRENT_BODY_C — third lecture."]
    : ["vol- article one.", "vol- article two.", "vol- article three."];

  const count = opts.big ? 3 : 2 + (courseId.charCodeAt(courseId.length - 1) % 2);
  const items = [];
  for (let position = 0; position < count; position += 1) {
    const item = await db.curriculumItem.create({
      data: {
        sectionId: section.id,
        type: "LECTURE",
        title: opts.big ? `vol- Lecture ${position + 1}` : `vol- Item ${position + 1}`,
        position,
        isPreview: position === 0,
        lecture: {
          create: {
            contentType: "ARTICLE",
            articleBody: bodies[position] ?? `vol- body ${position + 1}`,
            durationSeconds: 120 + position * 60,
          },
        },
      },
    });
    items.push(item);
  }
  return items;
}

async function grantMany(userIds: string[], courseId: string, source: "GRANT" | "FREE" | "PURCHASE") {
  for (let i = 0; i < userIds.length; i += 8) {
    const chunk = userIds.slice(i, i + 8);
    await Promise.all(chunk.map((userId) => grantEnrollment(userId, courseId, source)));
  }
}

async function seed(): Promise<void> {
  const instructor = await db.user.findUnique({ where: { email: "instructor@example.com" } });
  if (!instructor) {
    throw new Error("instructor@example.com is missing. Run `npx prisma db seed` first.");
  }

  const category = await db.category.findFirst({
    where: { slug: "web-development" },
    select: { id: true },
  });
  if (!category) {
    throw new Error("Taxonomy missing. Run `npx prisma db seed` first.");
  }

  await cleanVolData();

  console.log("Creating vol- users…");
  const volLearner = await ensureVolLearner();
  const bulkUsers = await ensureBulkUsers();
  if (bulkUsers.length < BULK_USER_COUNT) {
    throw new Error(`Expected ${BULK_USER_COUNT} vol-user-* rows, found ${bulkUsers.length}.`);
  }

  const enrolledOthers = bulkUsers.slice(0, BIG_ENROLL_COUNT - 1);
  const reviewers = enrolledOthers.slice(0, REVIEW_COUNT);

  console.log("Creating vol- courses…");
  const catalogCourses: { id: string; slug: string; title: string; index: number; free: boolean }[] =
    [];

  for (let n = 1; n <= CATALOG_COUNT; n += 1) {
    const free = n % 10 === 0;
    const course = await db.course.create({
      data: {
        title: catalogTitle(n),
        slug: catalogSlug(n),
        subtitle: `Volume catalog fixture ${pad(n)}.`,
        description: "vol- published catalog course used for pagination checks.",
        level: LEVELS[(n - 1) % LEVELS.length],
        language: n % 5 === 0 ? "bn" : "en",
        status: "PUBLISHED",
        primaryCategoryId: category.id,
        instructorId: instructor.id,
        publishedAt: new Date(Date.now() - (CATALOG_COUNT - n + 1) * 60_000),
      },
    });
    await db.price.createMany({
      data: free
        ? [
            { courseId: course.id, currency: "USD", amount: 0, isActive: true },
            { courseId: course.id, currency: "BDT", amount: 0, isActive: true },
          ]
        : [
            { courseId: course.id, currency: "USD", amount: 1900 + n * 100, isActive: true },
            { courseId: course.id, currency: "BDT", amount: 199000 + n * 1000, isActive: true },
          ],
    });
    await addCurriculum(course.id, { big: false });
    catalogCourses.push({ id: course.id, slug: course.slug, title: course.title, index: n, free });
  }

  const big = await db.course.create({
    data: {
      title: "vol- Big Course",
      slug: "vol-big-course",
      subtitle: "Volume course with reviews, Q&A, announcements, and enrollments.",
      description: "The high-cardinality fixture: 55 learners, 45 reviews, 60 replies.",
      level: "INTERMEDIATE",
      language: "en",
      status: "PUBLISHED",
      primaryCategoryId: category.id,
      instructorId: instructor.id,
      publishedAt: new Date(),
    },
  });
  await db.price.createMany({
    data: [
      { courseId: big.id, currency: "USD", amount: 7900, isActive: true },
      { courseId: big.id, currency: "BDT", amount: 799000, isActive: true },
    ],
  });
  const bigItems = await addCurriculum(big.id, { big: true });
  const qaItem = bigItems[0];
  if (!qaItem) throw new Error("Big course curriculum missing.");

  const paidCatalog = catalogCourses.filter((course) => !course.free);

  console.log("Enrolling…");
  await grantMany(
    [volLearner.id, ...enrolledOthers.map((user) => user.id)],
    big.id,
    "GRANT",
  );

  const learnerCatalog = catalogCourses.slice(0, LEARNER_ENROLLMENTS - 1);
  for (const course of learnerCatalog) {
    await grantEnrollment(volLearner.id, course.id, course.free ? "FREE" : "GRANT");
  }

  await recomputeCourseProgress(volLearner.id, big.id);

  console.log("Reviews…");
  await db.review.createMany({
    data: reviewers.map((user, index) => ({
      userId: user.id,
      courseId: big.id,
      rating: (index % 5) + 1,
      body: `vol- review ${index + 1} from ${user.email}`,
      status: "VISIBLE" as const,
      createdAt: new Date(Date.now() - (REVIEW_COUNT - index) * 60_000),
    })),
  });
  await recomputeCourseRating(big.id);

  console.log("Q&A…");
  const older = Date.now() - 86_400_000;
  for (let n = 1; n < THREAD_COUNT; n += 1) {
    await db.questionThread.create({
      data: {
        courseId: big.id,
        curriculumItemId: qaItem.id,
        userId: enrolledOthers[n % enrolledOthers.length]!.id,
        title: `vol- inbox thread ${pad(n)}`,
        body: `vol- filler question ${n} so studio/qa paginates.`,
        createdAt: new Date(older + n * 1000),
      },
    });
  }

  const qaThread = await db.questionThread.create({
    data: {
      courseId: big.id,
      curriculumItemId: qaItem.id,
      userId: volLearner.id,
      title: "vol- Q&A thread",
      body: "vol- question with 60 replies to exercise the 50-reply cap.",
      createdAt: new Date(),
    },
  });

  await db.threadReply.createMany({
    data: Array.from({ length: REPLY_COUNT }, (_, index) => ({
      threadId: qaThread.id,
      userId: enrolledOthers[index % enrolledOthers.length]!.id,
      body: `vol- reply ${index + 1}`,
      isInstructor: false,
      status: "VISIBLE" as const,
      createdAt: new Date(Date.now() - (REPLY_COUNT - index) * 1000),
    })),
  });

  console.log("Announcements…");
  const now = new Date();
  await db.announcement.createMany({
    data: Array.from({ length: ANNOUNCEMENTS }, (_, index) => ({
      courseId: big.id,
      authorId: instructor.id,
      subject: `vol- Announcement ${index + 1}`,
      body: `vol- announcement body ${index + 1}`,
      sentAt: new Date(now.getTime() - (ANNOUNCEMENTS - index) * 60_000),
    })),
  });

  console.log("Orders for vol-learner…");
  const orderCourses = [...learnerCatalog, ...paidCatalog.filter((c) => !learnerCatalog.includes(c))].slice(
    0,
    LEARNER_ORDERS,
  );
  if (orderCourses.length < LEARNER_ORDERS) {
    throw new Error("Not enough catalog courses to create 25 distinct orders.");
  }

  for (let i = 0; i < LEARNER_ORDERS; i += 1) {
    const course = orderCourses[i]!;
    const createdAt = new Date(Date.now() - (LEARNER_ORDERS - i) * 60_000);
    let status: "PAID" | "PENDING" | "FAILED" | "REFUNDED" = "PAID";
    if (i >= PAID_ORDERS && i < PAID_ORDERS + 2) status = "PENDING";
    else if (i === PAID_ORDERS + 2) status = "FAILED";
    else if (i === PAID_ORDERS + 3) status = "REFUNDED";

    const amount = course.free ? 0 : 1900 + course.index * 100;
    const order = await db.order.create({
      data: {
        userId: volLearner.id,
        status,
        currency: "USD",
        subtotal: amount,
        total: amount,
        createdAt,
        paidAt: status === "PAID" || status === "REFUNDED" ? createdAt : null,
        items: {
          create: {
            courseId: course.id,
            unitPrice: amount,
          },
        },
      },
    });

    if (status === "PAID" || status === "REFUNDED") {
      await db.payment.create({
        data: {
          orderId: order.id,
          userId: volLearner.id,
          method: "STRIPE",
          status: status === "REFUNDED" ? "REFUNDED" : "COMPLETED",
          amount,
          currency: "USD",
          stripePaymentIntentId: `pi_vol_${pad(i + 1, 3)}`,
          createdAt,
          paidAt: createdAt,
        },
      });
    }
  }

  console.log("Pending bKash queue…");
  const paymentCourses = paidCatalog.slice(0, PENDING_PAYMENTS);
  if (paymentCourses.length < PENDING_PAYMENTS) {
    throw new Error("Need 45 paid catalog courses for the admin payments queue.");
  }
  const payers = bulkUsers.slice(0, PENDING_PAYMENTS);

  for (let i = 0; i < PENDING_PAYMENTS; i += 1) {
    const course = paymentCourses[i]!;
    const payer = payers[i]!;
    const createdAt = new Date(Date.now() - (PENDING_PAYMENTS - i) * 30_000);
    const amount = 199000 + course.index * 1000;
    const order = await db.order.create({
      data: {
        userId: payer.id,
        status: "PENDING",
        currency: "BDT",
        subtotal: amount,
        total: amount,
        createdAt,
        items: {
          create: { courseId: course.id, unitPrice: amount },
        },
      },
    });
    await db.payment.create({
      data: {
        orderId: order.id,
        userId: payer.id,
        method: "BKASH",
        status: "PENDING_VERIFICATION",
        amount,
        currency: "BDT",
        bkashTransactionId: volTxn(i + 1),
        bkashPhoneNumber: volPhone(i + 1),
        bkashPaymentDate: createdAt,
        bkashReference: `vol- proof ${i + 1}`,
        createdAt,
      },
    });
  }

  console.log("Extra notifications…");
  const existingNotifs = await db.notification.count({ where: { userId: volLearner.id } });
  const needed = Math.max(0, 45 - existingNotifs);
  if (needed > 0) {
    await db.notification.createMany({
      data: Array.from({ length: needed }, (_, index) => ({
        userId: volLearner.id,
        type: "announcement",
        payload: {
          title: `vol- notice ${index + 1}`,
          body: `Volume notification ${index + 1} of ${needed}.`,
          href: "/notifications",
        },
        createdAt: new Date(Date.now() - (needed - index) * 1000),
      })),
    });
  }

  const seedLearner = await db.user.findUnique({ where: { email: "learner@example.com" } });
  const seedCourse = await db.course.findUnique({
    where: { slug: "typescript-foundations" },
    select: { id: true },
  });
  if (seedLearner && seedCourse) {
    const existingCert = await db.certificate.findFirst({
      where: { userId: seedLearner.id, courseId: seedCourse.id },
    });
    if (!existingCert) {
      await issueCertificate(seedLearner.id, seedCourse.id);
    }
  }

  const userCount = await db.user.count({ where: { email: { startsWith: "vol-" } } });
  const courseCount = await db.course.count({ where: { slug: { startsWith: "vol-" } } });
  const notifCount = await db.notification.count({ where: { userId: volLearner.id } });
  const orderCount = await db.order.count({ where: { userId: volLearner.id } });
  const pending = await db.payment.count({
    where: { status: "PENDING_VERIFICATION", bkashTransactionId: { startsWith: VOL_TXN_PREFIX } },
  });
  const enrollBig = await db.enrollment.count({ where: { courseId: big.id, revokedAt: null } });
  const enrollLearner = await db.enrollment.count({
    where: { userId: volLearner.id, revokedAt: null },
  });

  console.log("Volume seed complete.");
  console.log(`  users:           ${userCount}`);
  console.log(`  courses:         ${courseCount}`);
  console.log(`  big enrollments: ${enrollBig}`);
  console.log(`  learner enroll:  ${enrollLearner}`);
  console.log(`  learner orders:  ${orderCount}`);
  console.log(`  learner notifs:  ${notifCount}`);
  console.log(`  pending bKash:   ${pending}`);
  console.log(`  big slug:        ${big.slug}`);
  console.log(`  qa item:         ${qaItem.id}`);
  console.log("Wipe later with: npx tsx scripts/seed-volume.ts --clean");
}

const cleanOnly = process.argv.includes("--clean");

const run = cleanOnly ? cleanVolData() : seed();
run
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
