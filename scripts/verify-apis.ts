/**
 * HTTP inventory check for GlobalMentor360v2.
 *
 * APIs live in Next.js App Router app/api route handlers (plus one certificate
 * PDF route). There is no Express server.
 *
 * Prerequisite: the app is running (npm run dev or npm start) and Postgres
 * is up (docker compose up -d). Default origin: http://localhost:3000
 * Override with PLAYWRIGHT_BASE_URL / VERIFY_API_BASE_URL.
 *
 *   npm run verify:apis
 *
 * 401/403 on protected routes is PASS. 404 is PASS only when the resource is
 * missing (fake ids) or Better Auth has no handler for that subpath+method.
 * 5xx is FAIL. Wrong-method requests must be 405, not 2xx/5xx.
 *
 * Does not call Stripe Checkout, does not send a valid video webhook secret
 * (so MediaConvert is never applied), and does not print .env values or session
 * tokens.
 */
import "dotenv/config";

const BASE =
  process.env.VERIFY_API_BASE_URL?.replace(/\/$/, "") ||
  process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

const SEED_PASSWORD = "dev-password-12345";
const ACCOUNTS = {
  learner: "learner@example.com",
  instructor: "instructor@example.com",
  admin: "admin@example.com",
} as const;

type Expected = number | readonly number[] | ((status: number) => boolean);

type Check = {
  name: string;
  method: string;
  path: string;
  expected: Expected;
  body?: unknown;
  headers?: Record<string, string>;
  cookie?: string;
};

type Row = {
  name: string;
  method: string;
  path: string;
  expected: string;
  actual: string;
  result: "PASS" | "FAIL";
  detail?: string;
};

function expectedLabel(expected: Expected): string {
  if (typeof expected === "function") return "custom";
  if (typeof expected === "number") return String(expected);
  return expected.join("|");
}

function matches(expected: Expected, status: number): boolean {
  if (typeof expected === "function") return expected(status);
  if (typeof expected === "number") return status === expected;
  return expected.includes(status);
}

function cookieHeader(setCookies: string[]): string {
  return setCookies
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

async function request(
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string>; cookie?: string } = {},
): Promise<{ status: number; setCookies: string[] }> {
  const headers: Record<string, string> = {
    origin: BASE,
    ...opts.headers,
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });

  return { status: res.status, setCookies: res.headers.getSetCookie() };
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: SEED_PASSWORD }),
  });
  if (res.status !== 200) {
    throw new Error(`Sign-in failed for ${email} (HTTP ${res.status}). Seed the DB and confirm the app is running.`);
  }
  const cookie = cookieHeader(res.headers.getSetCookie());
  if (!cookie) throw new Error(`Sign-in for ${email} returned no session cookie.`);
  return cookie;
}

async function ensureAppUp(): Promise<void> {
  try {
    const res = await fetch(BASE, { redirect: "manual" });
    if (res.status >= 500) {
      throw new Error(`App at ${BASE} returned ${res.status}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot reach ${BASE}. Start the app with npm run dev (Postgres: docker compose up -d). ${message}`,
    );
  }
}

async function main(): Promise<number> {
  await ensureAppUp();

  const rows: Row[] = [];

  const learnerCookie = await signIn(ACCOUNTS.learner);
  const instructorCookie = await signIn(ACCOUNTS.instructor);
  const adminCookie = await signIn(ACCOUNTS.admin);

  const checks: Check[] = [
    // --- Better Auth catch-all: GET+POST /api/auth/[...all] ---
    { name: "auth health", method: "GET", path: "/api/auth/ok", expected: 200 },
    { name: "session anonymous", method: "GET", path: "/api/auth/get-session", expected: 200 },
    {
      name: "session learner",
      method: "GET",
      path: "/api/auth/get-session",
      expected: 200,
      cookie: learnerCookie,
    },
    {
      name: "session instructor",
      method: "GET",
      path: "/api/auth/get-session",
      expected: 200,
      cookie: instructorCookie,
    },
    {
      name: "session admin",
      method: "GET",
      path: "/api/auth/get-session",
      expected: 200,
      cookie: adminCookie,
    },
    {
      name: "list sessions unauthenticated",
      method: "GET",
      path: "/api/auth/list-sessions",
      expected: 401,
    },
    {
      name: "list sessions learner",
      method: "GET",
      path: "/api/auth/list-sessions",
      expected: 200,
      cookie: learnerCookie,
    },
    {
      name: "sign-in bad password",
      method: "POST",
      path: "/api/auth/sign-in/email",
      expected: 401,
      body: { email: ACCOUNTS.learner, password: "not-the-seed-password" },
    },
    {
      name: "sign-in GET is not a handler",
      method: "GET",
      path: "/api/auth/sign-in/email",
      expected: 404,
    },
    { name: "auth GET-only rejects PUT", method: "PUT", path: "/api/auth/get-session", expected: 405 },
    { name: "auth GET-only rejects DELETE", method: "DELETE", path: "/api/auth/ok", expected: 405 },

    // --- Captions: GET /api/captions/[captionId] ---
    {
      name: "caption missing id",
      method: "GET",
      path: "/api/captions/not-a-real-caption",
      expected: 404,
    },
    {
      name: "caption missing id signed in",
      method: "GET",
      path: "/api/captions/not-a-real-caption",
      expected: 404,
      cookie: learnerCookie,
    },
    {
      name: "caption rejects POST",
      method: "POST",
      path: "/api/captions/not-a-real-caption",
      expected: 405,
    },

    // --- Stripe webhook: POST only. Dummy body, never a valid signature. ---
    { name: "stripe webhook rejects GET", method: "GET", path: "/api/webhooks/stripe", expected: 405 },
    {
      name: "stripe webhook unsigned",
      method: "POST",
      path: "/api/webhooks/stripe",
      expected: 401,
      body: {},
    },
    {
      name: "stripe webhook rejects PUT",
      method: "PUT",
      path: "/api/webhooks/stripe",
      expected: 405,
    },

    // --- Video webhook: POST only. Never send x-webhook-secret from .env. ---
    { name: "video webhook rejects GET", method: "GET", path: "/api/video/webhook", expected: 405 },
    {
      name: "video webhook unsigned",
      method: "POST",
      path: "/api/video/webhook",
      expected: [401, 503],
      body: {},
    },
    { name: "video webhook rejects PATCH", method: "PATCH", path: "/api/video/webhook", expected: 405 },

    // --- Public HTML 404s must match the PDF route (not a soft-404 200) ---
    {
      name: "certificate html missing serial",
      method: "GET",
      path: "/certificates/not-a-real-serial",
      expected: 404,
    },
    {
      name: "unknown course slug",
      method: "GET",
      path: "/courses/this-slug-does-not-exist",
      expected: 404,
    },

    // --- Certificate PDF (App Router, not under /api) ---
    {
      name: "certificate pdf missing serial",
      method: "GET",
      path: "/certificates/not-a-real-serial/pdf",
      expected: 404,
    },
    {
      name: "certificate pdf rejects POST",
      method: "POST",
      path: "/certificates/not-a-real-serial/pdf",
      expected: 405,
    },
    {
      name: "sign-out",
      method: "POST",
      path: "/api/auth/sign-out",
      expected: 200,
      body: {},
      cookie: learnerCookie,
    },
  ];

  for (const check of checks) {
    try {
      const { status } = await request(check.method, check.path, {
        body: check.body,
        headers: check.headers,
        cookie: check.cookie,
      });
      const pass = matches(check.expected, status);
      const fail5xx = status >= 500 && !matches(check.expected, status);
      rows.push({
        name: check.name,
        method: check.method,
        path: check.path,
        expected: expectedLabel(check.expected),
        actual: String(status),
        result: pass && !fail5xx ? "PASS" : "FAIL",
        detail: pass ? undefined : `unexpected status ${status}`,
      });
    } catch (error) {
      rows.push({
        name: check.name,
        method: check.method,
        path: check.path,
        expected: expectedLabel(check.expected),
        actual: "ERR",
        result: "FAIL",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const nameWidth = Math.max(12, ...rows.map((row) => row.name.length));
  const pathWidth = Math.max(12, ...rows.map((row) => row.path.length));

  console.log(`GlobalMentor360v2 API verification  (${BASE})`);
  console.log("Express? no — Next.js App Router route handlers + Better Auth catch-all.\n");
  console.log(
    `${"NAME".padEnd(nameWidth)}  ${"METHOD".padEnd(7)}  ${"PATH".padEnd(pathWidth)}  ${"EXPECTED".padEnd(10)}  ${"ACTUAL".padEnd(7)}  RESULT`,
  );
  console.log("-".repeat(nameWidth + pathWidth + 42));

  let failed = 0;
  for (const row of rows) {
    if (row.result === "FAIL") failed += 1;
    console.log(
      `${row.name.padEnd(nameWidth)}  ${row.method.padEnd(7)}  ${row.path.padEnd(pathWidth)}  ${row.expected.padEnd(10)}  ${row.actual.padEnd(7)}  ${row.result}${row.detail ? `  ${row.detail}` : ""}`,
    );
  }

  console.log("");
  console.log("Not hit (secrets / paid side effects):");
  console.log("  - Stripe Checkout session create (card rail)");
  console.log("  - POST /api/webhooks/stripe with a valid stripe-signature");
  console.log("  - POST /api/video/webhook with x-webhook-secret (would apply MediaConvert jobs)");
  console.log("  - POST /api/auth/sign-up/email (would create users)");
  console.log("  - POST /api/auth/request-password-reset (sends mail / console links)");
  console.log("  - Server actions (not REST) — cover via Playwright page checks");

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    return 1;
  }
  console.log(`\n${rows.length} check(s) passed.`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
