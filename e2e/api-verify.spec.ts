import { expect, test, type APIRequestContext } from "@playwright/test";
import { SEED } from "./helpers";

/**
 * Mirrors `npm run verify:apis` inside Playwright so `npx playwright test`
 * covers the HTTP inventory with the same seed accounts.
 *
 * 401/403 on protected routes is a pass. 5xx is a fail. Wrong methods must 405.
 * Stripe Checkout and signed MediaConvert webhooks are not called.
 */

async function signIn(request: APIRequestContext, email: string) {
  const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const res = await request.post("/api/auth/sign-in/email", {
    data: { email, password: SEED.learner.password },
    headers: { origin },
  });
  expect(res.status(), `sign-in ${email}`).toBe(200);
}

test.describe("API inventory", () => {
  test("Better Auth, captions, webhooks, and certificate PDF respond correctly", async ({ request }) => {
    const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const jsonHeaders = { origin, "content-type": "application/json" };

    expect((await request.get("/api/auth/ok")).status()).toBe(200);
    expect((await request.get("/api/auth/get-session")).status()).toBe(200);

    const badLogin = await request.post("/api/auth/sign-in/email", {
      data: { email: SEED.learner.email, password: "not-the-seed-password" },
      headers: jsonHeaders,
    });
    expect(badLogin.status()).toBe(401);

    expect((await request.get("/api/auth/sign-in/email")).status()).toBe(404);
    expect((await request.fetch("/api/auth/get-session", { method: "PUT" })).status()).toBe(405);
    expect((await request.fetch("/api/auth/ok", { method: "DELETE" })).status()).toBe(405);
    expect((await request.get("/api/auth/list-sessions")).status()).toBe(401);

    await signIn(request, SEED.learner.email);
    expect((await request.get("/api/auth/get-session")).status()).toBe(200);
    expect((await request.get("/api/auth/list-sessions")).status()).toBe(200);

    await signIn(request, SEED.instructor.email);
    expect((await request.get("/api/auth/get-session")).status()).toBe(200);

    await signIn(request, SEED.admin.email);
    expect((await request.get("/api/auth/get-session")).status()).toBe(200);

    expect((await request.get("/api/captions/not-a-real-caption")).status()).toBe(404);
    expect((await request.post("/api/captions/not-a-real-caption")).status()).toBe(405);

    expect((await request.get("/api/webhooks/stripe")).status()).toBe(405);
    const stripePost = await request.post("/api/webhooks/stripe", { data: {}, headers: jsonHeaders });
    expect(stripePost.status(), "unsigned Stripe webhook must not 5xx").toBe(401);

    expect((await request.get("/api/video/webhook")).status()).toBe(405);
    const videoPost = await request.post("/api/video/webhook", { data: {}, headers: jsonHeaders });
    expect([401, 503]).toContain(videoPost.status());

    expect((await request.get("/certificates/not-a-real-serial")).status()).toBe(404);
    expect((await request.get("/certificates/not-a-real-serial/pdf")).status()).toBe(404);
    expect((await request.post("/certificates/not-a-real-serial/pdf")).status()).toBe(405);
    expect((await request.get("/courses/this-slug-does-not-exist")).status()).toBe(404);

    expect((await request.post("/api/auth/sign-out", { data: {}, headers: jsonHeaders })).status()).toBe(200);
  });
});
