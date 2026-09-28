-- Course FAQ: question-and-answer pairs on the course page, written in the studio.
--
-- Generated with `prisma migrate diff --from-config-datasource --to-schema`, then
-- trimmed: that diff also drops courses.search_vector and its indexes (Prisma
-- cannot express the generated column), which must never ship. Additive only.

-- CreateTable
CREATE TABLE "course_faqs" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "course_faqs_pkey" PRIMARY KEY ("id"),
    -- The studio form caps these too; the database refuses what slips past it.
    CONSTRAINT "course_faqs_question_length" CHECK (char_length("question") BETWEEN 1 AND 300),
    CONSTRAINT "course_faqs_answer_length" CHECK (char_length("answer") BETWEEN 1 AND 2000)
);

-- CreateIndex
CREATE INDEX "course_faqs_courseId_position_idx" ON "course_faqs"("courseId", "position");

-- AddForeignKey
ALTER TABLE "course_faqs" ADD CONSTRAINT "course_faqs_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
