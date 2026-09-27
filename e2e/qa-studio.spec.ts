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
    await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
    await paginateUntilVisible(page, page.getByRole("link", { name: /typescript foundations/i }));

    const nav = page.getByRole("navigation", { name: "Studio" });
    await expect(nav.getByRole("link", { name: "Courses" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Questions" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Coupons" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Announcements" })).toBeVisible();

    await nav.getByRole("link", { name: "Questions" }).click();
    await expect(page).toHaveURL(/\/studio\/qa/);
    await expect(page.getByRole("heading", { level: 1, name: "Questions" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Needs my answer" })).toBeVisible();

    await nav.getByRole("link", { name: "Coupons" }).click();
    await expect(page).toHaveURL(/\/studio\/coupons/);
    await expect(page.getByRole("heading", { level: 1, name: "Coupons" })).toBeVisible();

    await nav.getByRole("link", { name: "Announcements" }).click();
    await expect(page).toHaveURL(/\/studio\/announcements/);
    await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible();
    await expect(page.getByText("New announcement")).toBeVisible();
    await expect(page.getByLabel("Subject")).toBeVisible();

    await nav.getByRole("link", { name: "Courses" }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
    await paginateUntilVisible(page, page.getByRole("link", { name: /typescript foundations/i }));

    // From the public site, Studio lives in the account menu.
    await page.goto("/");
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: "Studio" }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
  });

  test("a course's analytics show its learners and where they stop", async ({ page }) => {
    await signIn(page, SEED.instructor, "/studio");
    const link = page.getByRole("link", { name: /typescript foundations/i });
    await paginateUntilVisible(page, link);
    await link.first().click();
    await page.getByRole("navigation", { name: "Course editor" }).getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(page.getByRole("heading", { level: 2, name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: "Learners" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Enrollments by week" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Learners who finished each item" })).toBeVisible();
  });

  test("landing editor, curriculum, quiz, article, and video upload UI", async ({ page }) => {
    await signIn(page, SEED.instructor, "/studio");

    const title = `QA Studio Draft ${STAMP}`;
    await page.getByRole("button", { name: "New course" }).click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    const editorNav = page.getByRole("navigation", { name: "Course editor" });
    await expect(editorNav.getByRole("link", { name: "Details" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel("Subtitle")).toBeVisible();
    await expect(page.getByLabel("Description")).toBeVisible();
    // No cloud storage locally: the image field says so and keeps the letter tile.
    const imageField = page.getByRole("group", { name: "Course image" });
    await expect(imageField).toContainText("need cloud storage");
    await expect(imageField.getByRole("button")).toHaveCount(0);
    await editorNav.getByRole("link", { name: "Landing page" }).click();
    await expect(page).toHaveURL(/tab=landing/);
    await expect(page.getByText("What you'll learn")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Objective 1" })).toBeVisible();
    await editorNav.getByRole("link", { name: "Details" }).click();

    await page.getByLabel("Subtitle").fill("QA landing editor subtitle");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText(/saved/i, { timeout: 15_000 });

    await editorNav.getByRole("link", { name: "Curriculum" }).click();
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
    await page.getByRole("navigation", { name: "Course editor" }).getByRole("link", { name: "Curriculum" }).click();
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

  test("dragging a lesson by its grip reorders the section", async ({ page }) => {
    await signIn(page, SEED.instructor, "/studio");
    await page.getByRole("button", { name: "New course" }).click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(`QA Drag ${STAMP}`);
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.getByRole("navigation", { name: "Course editor" }).getByRole("link", { name: "Curriculum" }).click();
    await page.getByLabel("New section title").fill("Drag section");
    await page.getByRole("button", { name: "Add section" }).click();
    for (const title of ["First lesson", "Second lesson"]) {
      await page.getByLabel("New item title").fill(title);
      await page.getByRole("button", { name: "Add lecture" }).click();
      await expect(page.getByRole("link", { name: title })).toBeVisible({ timeout: 15_000 });
    }

    // Item rows, not the section row that contains them (it has the section heading).
    const rows = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: /(First|Second) lesson/ }) })
      .filter({ hasNot: page.getByRole("heading") });
    const second = rows.filter({ hasText: "Second lesson" });
    const first = rows.filter({ hasText: "First lesson" });
    const grip = second.getByTitle("Drag to reorder");
    const target = await first.boundingBox();
    await grip.hover();
    await page.mouse.down();
    await page.mouse.move(target!.x + target!.width / 2, target!.y + 4, { steps: 8 });
    await page.mouse.up();

    const order = () => rows.getByRole("link").allTextContents();
    await expect.poll(order).toEqual(["Second lesson", "First lesson"]);
    await page.reload();
    await expect.poll(order).toEqual(["Second lesson", "First lesson"]);
  });

  test("instructor replies to a review and the course page shows it", async ({ page }) => {
    const reply = `Thanks for the review ${STAMP}.`;
    await signIn(page, SEED.instructor, "/studio/reviews");
    await expect(page.getByRole("heading", { level: 1, name: "Reviews" })).toBeVisible();
    const review = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "TypeScript Foundations" }) }).first();
    const form = review.getByRole("textbox");
    if ((await form.count()) === 0) {
      // A reply left by an earlier run: edit it instead.
      await review.getByRole("button", { name: /edit reply/i }).click();
    }
    await review.getByRole("textbox").fill(reply);
    await review.getByRole("button", { name: /post reply|save reply/i }).click();
    await expect(review.getByText(reply)).toBeVisible({ timeout: 15_000 });

    await page.goto("/courses/typescript-foundations#reviews");
    await expect(page.getByText(reply)).toBeVisible();
    await expect(page.getByText(/response from dana instructor/i).first()).toBeVisible();

    // Leave the seed as it was.
    await page.goto("/studio/reviews");
    const again = page.getByRole("listitem").filter({ hasText: reply });
    await again.getByRole("button", { name: "Delete reply" }).click();
    await again.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(reply)).toHaveCount(0, { timeout: 15_000 });
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
    await page.getByRole("button", { name: "New course" }).click();
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

test.describe("course review", () => {
  test.describe.configure({ timeout: 120_000 });

  test("instructor submits a course, admin returns it with a note, instructor reads it", async ({ page, context }) => {
    const title = `QA Review ${STAMP}`;
    await signIn(page, SEED.instructor, "/studio");
    await page.getByRole("button", { name: "New course" }).click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 20_000 });
    const editorUrl = page.url().split("?")[0]!;

    // Make it ready: a subtitle, a price, one section with one lecture.
    await page.getByLabel("Subtitle").fill("Ready for a reviewer");
    const nav = page.getByRole("navigation", { name: "Course editor" });
    await nav.getByRole("link", { name: "Pricing" }).click();
    await page.getByLabel("Price").fill("1500");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText(/saved/i, { timeout: 15_000 });

    await nav.getByRole("link", { name: "Curriculum" }).click();
    await page.getByLabel("New section title").fill("Only section");
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(page.getByRole("heading", { name: "Only section" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("New item title").fill("Only lecture");
    await page.getByRole("button", { name: "Add lecture" }).click();
    await expect(page.getByRole("link", { name: "Only lecture" })).toBeVisible({ timeout: 15_000 });

    await page.goto(`${editorUrl}?tab=publish`);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText(/sent for review/i)).toBeVisible({ timeout: 15_000 });

    await context.clearCookies();
    await signIn(page, SEED.admin, "/admin/courses");
    const queue = page.getByRole("region", { name: /waiting for review/i });
    const row = queue.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /^return/i }).click();
    const dialog = page.getByRole("dialog", { name: /return this course/i });
    await dialog.getByLabel("What needs to change").fill("Add a second lecture with an example.");
    await dialog.getByRole("button", { name: "Return with note" }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /return .*qa review/i })).toHaveCount(0);

    await context.clearCookies();
    await signIn(page, SEED.instructor, `${new URL(editorUrl).pathname}?tab=publish`);
    await expect(page.getByText("Returned for changes")).toBeVisible();
    await expect(page.getByText("Add a second lecture with an example.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
  });
});
