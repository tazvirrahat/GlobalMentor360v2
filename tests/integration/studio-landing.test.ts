import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Landing-page settings writes. Lined fields used to be deleted before the
 * price was validated, so a bad amount wiped objectives while the action
 * returned an error.
 */

const hoisted = vi.hoisted(() => ({ instructorId: "" }));

vi.mock("@/lib/session", () => ({
  requireRole: async () => ({
    id: hoisted.instructorId,
    email: "landing-instructor@example.test",
    name: "Landing Instructor",
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { updateCourse } = await import("@/app/(app)/studio/actions");
const { db } = await import("@/lib/db");

const run = randomUUID().slice(0, 8);
let courseId: string;

function form(entries: Record<string, string>, repeated: Record<string, string[]> = {}) {
  const f = new FormData();
  for (const [key, value] of Object.entries(entries)) f.set(key, value);
  for (const [key, values] of Object.entries(repeated)) {
    for (const value of values) f.append(key, value);
  }
  return f;
}

function settingsForm(overrides: Record<string, string> = {}, repeated: Record<string, string[]> = {}) {
  return form(
    {
      courseId,
      title: `Landing Course ${run}`,
      subtitle: "A subtitle",
      description: "",
      level: "ALL_LEVELS",
      language: "en",
      priceAmount: "",
      priceCurrency: "BDT",
      ...overrides,
    },
    repeated,
  );
}

beforeAll(async () => {
  hoisted.instructorId = (
    await db.user.create({
      data: { name: `Landing Instructor ${run}`, email: `landing-instr-${run}@example.test` },
      select: { id: true },
    })
  ).id;
  courseId = (
    await db.course.create({
      data: {
        title: `Landing Course ${run}`,
        slug: `landing-course-${run}`,
        status: "DRAFT",
        instructorId: hoisted.instructorId,
        objectives: { create: { text: "Keep this objective", position: 0 } },
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await db.course.deleteMany({ where: { id: courseId } });
  await db.user.deleteMany({ where: { id: hoisted.instructorId } });
  await db.$disconnect();
});

describe("updateCourse", () => {
  it("does not wipe objectives when the price is invalid", async () => {
    const result = await updateCourse(
      { status: "idle" },
      settingsForm(
        { priceAmount: "12.345", priceCurrency: "BDT" },
        { objectives: ["Keep this objective"] },
      ),
    );

    expect(result).toEqual({
      status: "error",
      message: "Price must be 0 or more, with at most 2 decimal places.",
    });

    const rows = await db.courseObjective.findMany({
      where: { courseId },
      orderBy: { position: "asc" },
      select: { text: true },
    });
    expect(rows.map((row) => row.text)).toEqual(["Keep this objective"]);
  });

  it("writes objectives when the price is valid", async () => {
    const result = await updateCourse(
      { status: "idle" },
      settingsForm({ priceAmount: "49.99", priceCurrency: "BDT" }, { objectives: ["Learn SQL joins"] }),
    );
    expect(result.status).toBe("done");

    const rows = await db.courseObjective.findMany({
      where: { courseId },
      orderBy: { position: "asc" },
      select: { text: true },
    });
    expect(rows.map((row) => row.text)).toEqual(["Learn SQL joins"]);

    const price = await db.price.findFirst({
      where: { courseId, currency: "BDT", isActive: true },
      select: { amount: true },
    });
    expect(price?.amount).toBe(4999);
  });
});

describe("updateCourse FAQ", () => {
  const faqs = () =>
    db.courseFaq.findMany({ where: { courseId }, orderBy: { position: "asc" }, select: { question: true, answer: true } });

  it("saves questions and answers in order, then replaces them", async () => {
    const first = await updateCourse(
      { status: "idle" },
      settingsForm(
        { faqEditor: "1" },
        { faqQuestion: ["Is it self-paced?", "Do I get a certificate?", ""], faqAnswer: ["Yes.", "When you finish.", ""] },
      ),
    );
    expect(first.status).toBe("done");
    expect(await faqs()).toEqual([
      { question: "Is it self-paced?", answer: "Yes." },
      { question: "Do I get a certificate?", answer: "When you finish." },
    ]);

    await updateCourse(
      { status: "idle" },
      settingsForm({ faqEditor: "1" }, { faqQuestion: ["Only this one?"], faqAnswer: ["Yes."] }),
    );
    expect(await faqs()).toEqual([{ question: "Only this one?", answer: "Yes." }]);
  });

  it("refuses a half-filled row and writes nothing", async () => {
    const result = await updateCourse(
      { status: "idle" },
      settingsForm(
        { faqEditor: "1", subtitle: "Should not be saved" },
        { faqQuestion: ["A question with no answer"], faqAnswer: [""] },
      ),
    );
    expect(result.status).toBe("error");
    expect(await faqs()).toEqual([{ question: "Only this one?", answer: "Yes." }]);
    const course = await db.course.findUniqueOrThrow({ where: { id: courseId }, select: { subtitle: true } });
    expect(course.subtitle).not.toBe("Should not be saved");
  });

  it("leaves the FAQ alone when the form has no FAQ editor", async () => {
    await updateCourse({ status: "idle" }, settingsForm({}, { objectives: ["Learn SQL joins"] }));
    expect(await faqs()).toEqual([{ question: "Only this one?", answer: "Yes." }]);
  });
});
