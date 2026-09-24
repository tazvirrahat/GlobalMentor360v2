import { expect, test } from "@playwright/test";
import { SEED, ensureSeedLearnerIsNotInstructor, paginateUntilVisible, signIn } from "./helpers";

/**
 * Exploratory QA for the INSTRUCTOR (studio) persona. Creates a uniquely named
 * draft so seed curriculum is not rewritten. Does not start a MediaConvert job.
 */

const STAMP = Date.now().toString(36).slice(-6);

test.describe("studio exploratory QA", () => {
  test.describe.configure({ timeout: 90_000 });

  test("learner cannot open /studio", async ({ page, context }) => {
    await ensureSeedLearnerIsNotInstructor(page);
    await context.clearCookies();
    await signIn(page, SEED.learner, "/studio");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Studio" })).toHaveCount(0);
  });

  test("studio nav reaches courses, questions, coupons, and announcements", async ({ page }) => {
    await signIn(page, SEED.instructor, "/studio");
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("heading", { name: "Studio", exact: true })).toBeVisible();
    await paginateUntilVisible(page, page.getByRole("link", { name: /typescript foundations/i }));

    const nav = page.getByRole("navigation", { name: "Studio" });
    await expect(nav.getByRole("link", { name: "Courses" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Questions" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Coupons" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Announcements" })).toBeVisible();

    await nav.getByRole("link", { name: "Questions" }).click();
    await expect(page).toHaveURL(/\/studio\/qa/);
    await expect(page.getByRole("heading", { name: "Questions" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Needs my answer" })).toBeVisible();

    await nav.getByRole("link", { name: "Coupons" }).click();
    await expect(page).toHaveURL(/\/studio\/coupons/);
    await expect(page.getByRole("heading", { name: "Coupons" })).toBeVisible();

    await nav.getByRole("link", { name: "Announcements" }).click();
    await expect(page).toHaveURL(/\/studio\/announcements/);
    await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible();
    await expect(page.getByText("New announcement")).toBeVisible();
    await expect(page.getByLabel("Subject")).toBeVisible();

    await nav.getByRole("link", { name: "Courses" }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("heading", { name: "Studio", exact: true })).toBeVisible();
    await paginateUntilVisible(page, page.getByRole("link", { name: /typescript foundations/i }));

    await page.goto("/studio/qa");
    await page.getByRole("banner").getByRole("link", { name: "Studio" }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("heading", { name: "Studio", exact: true })).toBeVisible();
  });

  test("landing editor, curriculum, quiz, article, and video upload UI", async ({ page }) => {
    await signIn(page, SEED.instructor, "/studio");

    const title = `QA Studio Draft ${STAMP}`;
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.getByText("Settings", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Subtitle")).toBeVisible();
    await expect(page.getByLabel("Description")).toBeVisible();
    await expect(page.getByText("What you'll learn")).toBeVisible();

    await page.getByLabel("Subtitle").fill("QA landing editor subtitle");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText(/saved/i, { timeout: 15_000 });

    await page.getByRole("link", { name: /edit curriculum/i }).click();
    await expect(page.getByRole("heading", { name: "Curriculum" })).toBeVisible();
    await page.getByLabel("New section title").fill("QA section");
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(page.getByRole("heading", { name: "QA section" })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("New item title").fill("QA article lecture");
    await page.getByRole("button", { name: "Add lecture" }).click();
    await expect(page.getByRole("link", { name: "QA article lecture" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Add video" })).toBeVisible();

    await page.getByLabel("New item title").fill("QA quiz");
    await page.getByRole("button", { name: "Add quiz" }).click();
    await expect(page.getByRole("link", { name: "QA quiz" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/no questions yet/i)).toBeVisible();

    await page.getByRole("link", { name: "QA article lecture" }).click();
    await expect(page).toHaveURL(/\/curriculum\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "QA article lecture" })).toBeVisible();
    await expect(page.getByLabel("Article body")).toBeVisible();
    await page.getByLabel("Article body").fill("QA article body for the player.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText(/saved/i, { timeout: 15_000 });

    await page.getByRole("link", { name: "Curriculum" }).click();
    await page.getByRole("link", { name: "QA quiz" }).click();
    await expect(page.getByRole("heading", { name: "QA quiz" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add question" })).toBeVisible();

    // Seed course: video upload + SQS refresh live on lectures that already exist.
    await page.goto("/studio");
    await paginateUntilVisible(page, page.getByRole("link", { name: /typescript foundations/i }));
    await page.getByRole("link", { name: /typescript foundations/i }).click();
    await page.getByRole("link", { name: /edit curriculum/i }).click();
    await expect(page.getByRole("button", { name: /add video|replace video/i }).first()).toBeVisible();
    const checkStatus = page.getByRole("button", { name: "Check status" });
    test.info().annotations.push({
      type: "note",
      description:
        (await checkStatus.count()) > 0
          ? "Check status is visible (asset uploading/processing)."
          : "Check status hidden until a lecture is UPLOADING/PROCESSING; curriculum page still drains SQS on load.",
    });
  });

  test("instructor cannot create a catalog-wide coupon; course-scoped create works", async ({
    page,
  }) => {
    await signIn(page, SEED.instructor, "/studio/coupons");
    await expect(page.getByLabel("Course")).toBeVisible();
    await page.getByLabel("Course").click();
    await expect(page.getByRole("option", { name: /all courses/i })).toHaveCount(0);
    await page.keyboard.press("Escape");

    const code = `QAINS${STAMP}`;
    await page.getByLabel("Code").fill(code);
    await page.getByRole("button", { name: "Create coupon" }).click();

    const status = page.getByRole("status");
    await expect(status).toBeVisible({ timeout: 15_000 });
    const message = (await status.innerText()).trim();
    expect(
      message,
      "Instructor coupon create must not be treated as catalog-wide",
    ).not.toMatch(/only an admin can create a coupon that applies to every course/i);
    await expect(page.getByRole("status")).toContainText(code.toUpperCase());
  });

  test("admin coupon form offers All courses and existing catalog courses", async ({ page }) => {
    await signIn(page, SEED.admin, "/studio/coupons");
    await page.getByLabel("Course").click();
    await expect(page.getByRole("option", { name: "All courses" })).toBeVisible();
    await expect(page.getByRole("option", { name: /typescript foundations/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /sql for analysts/i })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("announcement composer submits with the default course selected", async ({ page }) => {
    await signIn(page, SEED.instructor, "/studio");
    const draftTitle = `QA Announce Draft ${STAMP}`;
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(draftTitle);
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("heading", { name: draftTitle })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Subtitle").fill("Touch updatedAt so recency would pick this draft.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText(/saved/i, { timeout: 15_000 });

    await page.goto("/studio/announcements");
    const course = page.getByLabel("Course");
    await expect(course).not.toContainText(draftTitle);
    await course.click();
    await page.getByRole("option", { name: /typescript foundations/i }).click();

    await page.getByLabel("Subject").fill(`QA studio ping ${STAMP}`);
    await page.getByLabel("Message").fill("QA announcement body — checking the course select posts.");
    await page.getByRole("button", { name: "Send to enrolled learners" }).click();

    const status = page.getByRole("status");
    await expect(status).toBeVisible({ timeout: 20_000 });
    const message = (await status.innerText()).trim();
    expect(message, "Announcement must include a courseId from the select").not.toMatch(
      /invalid input|required|expected string/i,
    );
    expect(message, "Default course should be the published course with learners").not.toMatch(
      /sent to 0 learners/i,
    );
    const sent = page.locator("li").filter({ hasText: `QA studio ping ${STAMP}` });
    await expect(sent.getByRole("heading", { name: `QA studio ping ${STAMP}` })).toBeVisible();
    await expect(sent.getByText(/typescript foundations/i)).toBeVisible();
  });
});
