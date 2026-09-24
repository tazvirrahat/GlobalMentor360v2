/**
 * Full HTTP matrix for GlobalMentor360v2 App Router surfaces.
 *
 * Physical handlers (search app/api and app/certificates for route.ts):
 *   GET+POST  /api/auth/[...all]              Better Auth catch-all
 *   GET       /api/captions/[captionId]       entitlement via canAccessItemMedia
 *   POST      /api/video/webhook              x-webhook-secret
 *   POST      /api/webhooks/stripe            stripe-signature
 *   GET       /certificates/[serial]/pdf      public PDF
 *
 * Does not modify domain/product code. May insert/delete isolated caption
 * fixture rows and restore lecture.assetId. Does not change seed passwords,
 * unpublish courses, create Stripe Checkout sessions, or start MediaConvert.
 *
 *   npm run verify:apis:full
 *
 * Never prints .env secret values or session tokens.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

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

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const ROLES = ["anon", "learner", "instructor", "admin"] as const;
const FAKE_UUID = "01234567-89ab-cdef-0123-456789abcdef";
const FAKE_CUID = "clw0verifyfull000000000000";
const NONEXISTENT_ASSET = "api-verify-full-nonexistent-assetId";
const REQUEST_TIMEOUT_MS = 20_000;

type Role = (typeof ROLES)[number];
type Expected = number | readonly number[] | ((status: number) => boolean);

type Check = {
  route: string;
  method: string;
  role: Role | "n/a";
  scenario: string;
  path: string;
  expected: Expected;
  expectedLabel?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  cookie?: string;
  cause?: string;
  assert?: (res: Awaited<ReturnType<typeof request>>) => string | undefined;
};

type Row = {
  route: string;
  method: string;
  role: string;
  scenario: string;
  expected: string;
  actual: string;
  result: "PASS" | "FAIL";
  detail?: string;
  path: string;
  cause?: string;
};

function expectedLabel(expected: Expected, override?: string): string {
  if (override) return override;
  if (typeof expected === "function") return "4xx";
  if (typeof expected === "number") return String(expected);
  return expected.join("|");
}

function matches(expected: Expected, status: number): boolean {
  if (typeof expected === "function") return expected(status);
  if (typeof expected === "number") return status === expected;
  return expected.includes(status);
}

const is4xx: Expected = (status) => status >= 400 && status < 500;

function cookieHeader(setCookies: string[]): string {
  return setCookies
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

async function request(
  method: string,
  path: string,
  opts: {
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
    cookie?: string;
  } = {},
): Promise<{ status: number; setCookies: string[]; text: string; contentType: string | null }> {
  const headers: Record<string, string> = {
    origin: BASE,
    ...opts.headers,
  };
  if (opts.cookie) headers.cookie = opts.cookie;

  let body: string | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    if (!headers["content-type"]) headers["content-type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      status: res.status,
      setCookies: res.headers.getSetCookie(),
      text,
      contentType: res.headers.get("content-type"),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function signIn(email: string): Promise<string> {
  const res = await request("POST", "/api/auth/sign-in/email", {
    body: { email, password: SEED_PASSWORD },
  });
  if (res.status !== 200) {
    throw new Error(`Sign-in failed for ${email} (HTTP ${res.status}).`);
  }
  const cookie = cookieHeader(res.setCookies);
  if (!cookie) throw new Error(`Sign-in for ${email} returned no session cookie.`);
  return cookie;
}

async function ensureAppUp(): Promise<void> {
  try {
    const res = await request("GET", "/api/auth/ok");
    if (res.status >= 500) {
      throw new Error(`App at ${BASE} returned ${res.status}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot reach ${BASE}. Reuse the existing npm run dev on :3000; do not restart it from this script. ${message}`,
    );
  }
}

function cookieFor(
  role: Role | "n/a",
  cookies: Record<Exclude<Role, "anon">, string>,
): string | undefined {
  if (role === "anon" || role === "n/a") return undefined;
  return cookies[role];
}

type CaptionFixture = {
  previewCaptionId: string;
  lockedCaptionId: string;
  previewLectureId: string;
  lockedLectureId: string;
  previewPrevAsset: string | null;
  lockedPrevAsset: string | null;
  assetIds: string[];
  captionIds: string[];
};

async function loadFixtures(pool: Pool): Promise<{
  certSerial: string | null;
  captions: CaptionFixture | null;
}> {
  const cert = await pool.query<{ serial: string }>("SELECT serial FROM certificates LIMIT 1");
  const items = await pool.query<{
    id: string;
    title: string;
    isPreview: boolean;
    slug: string;
    lecture_id: string | null;
    assetId: string | null;
  }>(
    `SELECT ci.id, ci.title, ci."isPreview", c.slug, l.id AS lecture_id, l."assetId"
     FROM curriculum_items ci
     JOIN sections s ON s.id = ci."sectionId"
     JOIN courses c ON c.id = s."courseId"
     LEFT JOIN lectures l ON l."curriculumItemId" = ci.id
     WHERE c.slug = 'typescript-foundations'
     ORDER BY s.position, ci.position`,
  );

  const preview = items.rows.find((row) => row.isPreview && row.lecture_id);
  const locked = items.rows.find((row) => !row.isPreview && row.lecture_id);
  if (!preview?.lecture_id || !locked?.lecture_id) {
    return { certSerial: cert.rows[0]?.serial ?? null, captions: null };
  }

  const previewAssetId = randomUUID();
  const lockedAssetId = randomUUID();
  const previewCaptionId = randomUUID();
  const lockedCaptionId = randomUUID();

  await pool.query(
    `INSERT INTO media_assets (id, provider, "providerAssetId", status, "createdAt", "updatedAt")
     VALUES ($1, 'aws', $2, 'READY', NOW(), NOW()), ($3, 'aws', $4, 'READY', NOW(), NOW())`,
    [
      previewAssetId,
      `api-verify-full-preview-${previewAssetId}`,
      lockedAssetId,
      `api-verify-full-locked-${lockedAssetId}`,
    ],
  );
  await pool.query(
    `INSERT INTO captions (id, "assetId", language, "vttKey", source)
     VALUES ($1, $2, 'zz', $3, 'UPLOADED'), ($4, $5, 'zz', $6, 'UPLOADED')`,
    [
      previewCaptionId,
      previewAssetId,
      `captions/api-verify-full/${previewAssetId}/zz.vtt`,
      lockedCaptionId,
      lockedAssetId,
      `captions/api-verify-full/${lockedAssetId}/zz.vtt`,
    ],
  );
  await pool.query(`UPDATE lectures SET "assetId" = $1 WHERE id = $2`, [
    previewAssetId,
    preview.lecture_id,
  ]);
  await pool.query(`UPDATE lectures SET "assetId" = $1 WHERE id = $2`, [
    lockedAssetId,
    locked.lecture_id,
  ]);

  return {
    certSerial: cert.rows[0]?.serial ?? null,
    captions: {
      previewCaptionId,
      lockedCaptionId,
      previewLectureId: preview.lecture_id,
      lockedLectureId: locked.lecture_id,
      previewPrevAsset: preview.assetId,
      lockedPrevAsset: locked.assetId,
      assetIds: [previewAssetId, lockedAssetId],
      captionIds: [previewCaptionId, lockedCaptionId],
    },
  };
}

async function restoreFixtures(pool: Pool, captions: CaptionFixture | null): Promise<void> {
  if (!captions) return;
  await pool.query(`UPDATE lectures SET "assetId" = $1 WHERE id = $2`, [
    captions.previewPrevAsset,
    captions.previewLectureId,
  ]);
  await pool.query(`UPDATE lectures SET "assetId" = $1 WHERE id = $2`, [
    captions.lockedPrevAsset,
    captions.lockedLectureId,
  ]);
  await pool.query(`DELETE FROM captions WHERE id = ANY($1::text[])`, [captions.captionIds]);
  await pool.query(`DELETE FROM media_assets WHERE id = ANY($1::text[])`, [captions.assetIds]);
}

function buildChecks(input: {
  cookies: Record<Exclude<Role, "anon">, string>;
  certSerial: string | null;
  captions: CaptionFixture | null;
  webhookSecretSet: boolean;
  stripeConfigured: boolean;
}): Check[] {
  const checks: Check[] = [];
  const { cookies, certSerial, captions, webhookSecretSet } = input;

  const add = (check: Check) => {
    checks.push(check);
  };

  // --- Physical route × method × role ---
  for (const role of ROLES) {
    const cookie = cookieFor(role, cookies);

    for (const method of METHODS) {
      const authExpected =
        method === "GET"
          ? 200
          : method === "HEAD"
            ? 404
            : method === "OPTIONS"
              ? 204
              : 405;
      add({
        route: "/api/auth/[...all]",
        method,
        role,
        scenario: "get-session method sweep",
        path: "/api/auth/get-session",
        expected: authExpected,
        body: method === "POST" ? {} : undefined,
        cookie,
        cause: "app/api/auth/[...all]/route.ts:4. get-session is GET in practice (POST JSON → 405).",
      });

      const captionMethodExpected =
        method === "GET" || method === "HEAD" ? 404 : method === "OPTIONS" ? 204 : 405;
      add({
        route: "/api/captions/[captionId]",
        method,
        role,
        scenario: "missing caption method sweep",
        path: `/api/captions/${FAKE_UUID}`,
        expected: captionMethodExpected,
        cookie,
        cause: "app/api/captions/[captionId]/route.ts:9 (GET only; OPTIONS 204 from Next.js)",
      });

      const videoExpected: Expected =
        method === "POST"
          ? webhookSecretSet
            ? 401
            : [401, 503]
          : method === "OPTIONS"
            ? 204
            : 405;
      add({
        route: "/api/video/webhook",
        method,
        role,
        scenario: "unsigned / wrong-method sweep",
        path: "/api/video/webhook",
        expected: videoExpected,
        expectedLabel:
          method === "POST" ? (webhookSecretSet ? "401" : "401|503") : method === "OPTIONS" ? "204" : "405",
        body: method === "POST" ? {} : undefined,
        cookie,
        cause: "app/api/video/webhook/route.ts:15 (POST only) + lib/video/aws.ts:427",
      });

      add({
        route: "/api/webhooks/stripe",
        method,
        role,
        scenario: "unsigned / wrong-method sweep",
        path: "/api/webhooks/stripe",
        expected: method === "POST" ? 401 : method === "OPTIONS" ? 204 : 405,
        body: method === "POST" ? {} : undefined,
        cookie,
        cause: "app/api/webhooks/stripe/route.ts:14 + lib/payments/stripe.ts:195",
      });

      add({
        route: "/certificates/[serial]/pdf",
        method,
        role,
        scenario: "missing serial method sweep",
        path: "/certificates/not-a-real-serial/pdf",
        expected: method === "GET" || method === "HEAD" ? 404 : method === "OPTIONS" ? 204 : 405,
        cookie,
        cause: "app/(site)/certificates/[serial]/pdf/route.ts:7 (GET only)",
      });
    }

    add({
      route: "/api/auth/[...all]",
      method: "POST",
      role,
      scenario: "get-session POST without JSON content-type",
      path: "/api/auth/get-session",
      expected: 415,
      cookie,
      cause: "better-auth POST get-session requires application/json (415)",
    });
  }

  // --- Auth: supported endpoints, roles, edges ---
  add({
    route: "/api/auth/[...all]",
    method: "GET",
    role: "anon",
    scenario: "health ok",
    path: "/api/auth/ok",
    expected: 200,
    cause: "node_modules/better-auth dist /ok",
  });

  for (const role of ROLES) {
    add({
      route: "/api/auth/[...all]",
      method: "GET",
      role,
      scenario: "get-session",
      path: "/api/auth/get-session",
      expected: 200,
      cookie: cookieFor(role, cookies),
      cause: "better-auth get-session returns 200 with null session when anonymous",
      assert: (res) => {
        if (role === "anon") return undefined;
        if (!res.text.includes('"email"')) {
          return "expected session payload to include email";
        }
        return undefined;
      },
    });
  }

  add({
    route: "/api/auth/[...all]",
    method: "GET",
    role: "anon",
    scenario: "list-sessions requires auth",
    path: "/api/auth/list-sessions",
    expected: 401,
    cause: "better-auth list-sessions sessionMiddleware",
  });
  for (const role of ["learner", "instructor", "admin"] as const) {
    add({
      route: "/api/auth/[...all]",
      method: "GET",
      role,
      scenario: "list-sessions",
      path: "/api/auth/list-sessions",
      expected: 200,
      cookie: cookies[role],
      cause: "better-auth list-sessions",
    });
  }

  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "sign-in wrong password",
    path: "/api/auth/sign-in/email",
    expected: 401,
    body: { email: ACCOUNTS.learner, password: "not-the-seed-password" },
    cause: "lib/auth.ts emailAndPassword + better-auth sign-in/email",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "sign-in missing fields",
    path: "/api/auth/sign-in/email",
    expected: is4xx,
    expectedLabel: "4xx",
    body: {},
    cause: "better-auth sign-in/email body schema",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "sign-in bad JSON",
    path: "/api/auth/sign-in/email",
    expected: is4xx,
    expectedLabel: "4xx",
    rawBody: "{",
    headers: { "content-type": "application/json" },
    cause: "better-auth / Next body parse",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "sign-in wrong content-type",
    path: "/api/auth/sign-in/email",
    expected: is4xx,
    expectedLabel: "4xx",
    rawBody: JSON.stringify({ email: ACCOUNTS.learner, password: SEED_PASSWORD }),
    headers: { "content-type": "text/plain" },
    cause: "better-auth allowedMediaTypes",
  });
  add({
    route: "/api/auth/[...all]",
    method: "GET",
    role: "anon",
    scenario: "sign-in GET is not a handler",
    path: "/api/auth/sign-in/email",
    expected: 404,
    cause: "better-auth sign-in/email is POST-only → catch-all 404",
  });

  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "sign-up missing fields (must not create user)",
    path: "/api/auth/sign-up/email",
    expected: is4xx,
    expectedLabel: "4xx",
    body: { email: "not-an-email" },
    cause: "better-auth sign-up/email",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "sign-up password too short",
    path: "/api/auth/sign-up/email",
    expected: is4xx,
    expectedLabel: "4xx",
    body: { name: "Temp", email: "api-verify-full-must-not-exist@example.com", password: "short" },
    cause: "lib/auth.ts minPasswordLength: 12",
  });

  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "request-password-reset missing email",
    path: "/api/auth/request-password-reset",
    expected: is4xx,
    expectedLabel: "4xx",
    body: {},
    cause: "better-auth request-password-reset",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "request-password-reset unknown email (no user created)",
    path: "/api/auth/request-password-reset",
    expected: is4xx,
    expectedLabel: "4xx|200",
    body: { email: "nobody-api-verify-full@example.com" },
    cause: "better-auth request-password-reset (often 200 to avoid enumeration)",
  });
  // Override expected to accept 200 or 4xx for unknown email.
  checks[checks.length - 1]!.expected = (status) =>
    (status >= 400 && status < 500) || status === 200;
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "reset-password missing token (must not change seed passwords)",
    path: "/api/auth/reset-password",
    expected: is4xx,
    expectedLabel: "4xx",
    body: { newPassword: "would-not-apply-this-password-ok" },
    cause: "better-auth reset-password",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "reset-password fake token",
    path: "/api/auth/reset-password",
    expected: is4xx,
    expectedLabel: "4xx",
    body: { newPassword: "would-not-apply-this-password-ok", token: "not-a-real-reset-token" },
    cause: "better-auth reset-password",
  });
  add({
    route: "/api/auth/[...all]",
    method: "GET",
    role: "anon",
    scenario: "forget-password alias (if any)",
    path: "/api/auth/forget-password",
    expected: (status) => status === 404 || status === 405 || (status >= 400 && status < 500),
    expectedLabel: "404|4xx",
    cause: "Better Auth 1.6 uses /request-password-reset; alias may 404",
  });

  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "change-email unauthenticated",
    path: "/api/auth/change-email",
    expected: 401,
    body: { newEmail: "attacker@example.com" },
    cause: "better-auth change-email sessionMiddleware",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "learner",
    scenario: "change-email missing newEmail (must not change seed email)",
    path: "/api/auth/change-email",
    expected: is4xx,
    expectedLabel: "4xx",
    body: {},
    cookie: cookies.learner,
    cause: "better-auth change-email body schema",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "learner",
    scenario: "change-email invalid email",
    path: "/api/auth/change-email",
    expected: is4xx,
    expectedLabel: "4xx",
    body: { newEmail: "not-an-email" },
    cookie: cookies.learner,
    cause: "better-auth change-email ZodEmail",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "change-password unauthenticated",
    path: "/api/auth/change-password",
    expected: 401,
    body: { currentPassword: "x", newPassword: "yyyyyyyyyyyy" },
    cause: "better-auth change-password",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "learner",
    scenario: "change-password wrong current (must not change seed password)",
    path: "/api/auth/change-password",
    expected: is4xx,
    expectedLabel: "4xx",
    body: { currentPassword: "definitely-wrong-password", newPassword: "yyyyyyyyyyyy" },
    cookie: cookies.learner,
    cause: "better-auth change-password",
  });

  add({
    route: "/api/auth/[...all]",
    method: "GET",
    role: "anon",
    scenario: "list-accounts unauthenticated",
    path: "/api/auth/list-accounts",
    expected: 401,
    cause: "better-auth list-accounts",
  });
  add({
    route: "/api/auth/[...all]",
    method: "GET",
    role: "learner",
    scenario: "list-accounts",
    path: "/api/auth/list-accounts",
    expected: 200,
    cookie: cookies.learner,
    cause: "better-auth list-accounts",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "revoke-sessions unauthenticated (must not revoke sibling sessions)",
    path: "/api/auth/revoke-sessions",
    expected: 401,
    body: {},
    cause: "better-auth revoke-sessions",
  });
  add({
    route: "/api/auth/[...all]",
    method: "GET",
    role: "anon",
    scenario: "error page",
    path: "/api/auth/error",
    expected: 200,
    cause: "better-auth /error",
  });
  add({
    route: "/api/auth/[...all]",
    method: "GET",
    role: "anon",
    scenario: "unknown auth subpath",
    path: "/api/auth/this-endpoint-does-not-exist",
    expected: 404,
    cause: "better-auth catch-all unknown path",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "send-verification-email missing fields",
    path: "/api/auth/send-verification-email",
    expected: is4xx,
    expectedLabel: "4xx",
    body: {},
    cause: "better-auth send-verification-email",
  });
  add({
    route: "/api/auth/[...all]",
    method: "GET",
    role: "anon",
    scenario: "verify-email missing token",
    path: "/api/auth/verify-email",
    expected: is4xx,
    expectedLabel: "4xx",
    cause: "better-auth verify-email query.token",
  });
  add({
    route: "/api/auth/[...all]",
    method: "POST",
    role: "anon",
    scenario: "sign-in/social missing provider",
    path: "/api/auth/sign-in/social",
    expected: is4xx,
    expectedLabel: "4xx",
    body: {},
    cause: "better-auth sign-in/social (social not configured)",
  });

  // --- Captions: nonexistent + entitlement ---
  add({
    route: "/api/captions/[captionId]",
    method: "GET",
    role: "anon",
    scenario: "nonexistent uuid",
    path: `/api/captions/${FAKE_UUID}`,
    expected: 404,
    cause: "app/api/captions/[captionId]/route.ts:16",
  });
  add({
    route: "/api/captions/[captionId]",
    method: "GET",
    role: "learner",
    scenario: "nonexistent cuid-shaped id",
    path: `/api/captions/${FAKE_CUID}`,
    expected: 404,
    cookie: cookies.learner,
    cause: "app/api/captions/[captionId]/route.ts:16",
  });
  add({
    route: "/api/captions/[captionId]",
    method: "GET",
    role: "admin",
    scenario: "nonexistent id still 404 (not 500)",
    path: `/api/captions/${FAKE_UUID}`,
    expected: 404,
    cookie: cookies.admin,
    cause: "app/api/captions/[captionId]/route.ts:16",
  });

  if (captions) {
    // Preview item: canPlayItem allows anonymous. Then S3 GetObject on a
    // missing key → 404; unconfigured AWS throws uncaught → 500 (FAIL).
    const allowedAfterGate: Expected = (status) => status === 200 || status === 404;
    add({
      route: "/api/captions/[captionId]",
      method: "GET",
      role: "anon",
      scenario: "preview item (expect entitled; 200 if VTT exists else 404, never 5xx)",
      path: `/api/captions/${captions.previewCaptionId}`,
      expected: allowedAfterGate,
      expectedLabel: "200|404",
      cause: "app/api/captions/[captionId]/route.ts:21 + lib/entitlement.ts:52 + lib/video/aws.ts:545",
    });
    add({
      route: "/api/captions/[captionId]",
      method: "GET",
      role: "learner",
      scenario: "unlocked preview lesson (expect 200 if VTT exists else 404)",
      path: `/api/captions/${captions.previewCaptionId}`,
      expected: allowedAfterGate,
      expectedLabel: "200|404",
      cookie: cookies.learner,
      cause: "app/api/captions/[captionId]/route.ts:21",
    });
    add({
      route: "/api/captions/[captionId]",
      method: "GET",
      role: "learner",
      scenario: "locked sequential lesson (expect 403)",
      path: `/api/captions/${captions.lockedCaptionId}`,
      expected: 403,
      cookie: cookies.learner,
      cause: "lib/progress.ts:561 canAccessItemMedia + sequentialLockedIds",
    });
    add({
      route: "/api/captions/[captionId]",
      method: "GET",
      role: "anon",
      scenario: "locked non-preview (expect 403)",
      path: `/api/captions/${captions.lockedCaptionId}`,
      expected: 403,
      cause: "lib/entitlement.ts:53 not-enrolled",
    });
    add({
      route: "/api/captions/[captionId]",
      method: "GET",
      role: "instructor",
      scenario: "locked item, instructor not enrolled as learner",
      path: `/api/captions/${captions.lockedCaptionId}`,
      expected: 403,
      cookie: cookies.instructor,
      cause: "canAccessItemMedia uses enrollment/preview, not studio ownership",
    });
    add({
      route: "/api/captions/[captionId]",
      method: "GET",
      role: "admin",
      scenario: "locked item, admin not enrolled",
      path: `/api/captions/${captions.lockedCaptionId}`,
      expected: 403,
      cookie: cookies.admin,
      cause: "admin role is not a media entitlement",
    });
  }

  // --- Video webhook ---
  add({
    route: "/api/video/webhook",
    method: "POST",
    role: "anon",
    scenario: "missing x-webhook-secret",
    path: "/api/video/webhook",
    expected: webhookSecretSet ? 401 : [401, 503],
    expectedLabel: webhookSecretSet ? "401" : "401|503",
    body: {},
    cause: "lib/video/aws.ts:431-432; missing secret throws 503 at route.ts:28",
  });
  add({
    route: "/api/video/webhook",
    method: "POST",
    role: "anon",
    scenario: "wrong x-webhook-secret",
    path: "/api/video/webhook",
    expected: webhookSecretSet ? 401 : [401, 503],
    expectedLabel: webhookSecretSet ? "401" : "401|503",
    body: {},
    headers: { "x-webhook-secret": "definitely-not-the-env-secret" },
    cause: "lib/video/aws.ts:432 constantTimeEquals → null → route.ts:34 401",
  });
  add({
    route: "/api/video/webhook",
    method: "POST",
    role: "anon",
    scenario: "valid secret + malformed JSON (must be 4xx, never 5xx)",
    path: "/api/video/webhook",
    expected: is4xx,
    expectedLabel: "4xx",
    rawBody: "{",
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": process.env.AWS_VIDEO_WEBHOOK_SECRET || "unset",
    },
    cause: "lib/video/aws.ts:434 mapMediaConvertJobEvent(null) → route.ts:34 401",
  });
  add({
    route: "/api/video/webhook",
    method: "POST",
    role: "anon",
    scenario: "valid secret + well-formed fake COMPLETE for nonexistent assetId",
    path: "/api/video/webhook",
    expected: [200, 404],
    body: {
      "detail-type": "MediaConvert Job State Change",
      source: "aws.mediaconvert",
      detail: {
        status: "COMPLETE",
        jobId: "api-verify-full-nonexistent-jobId",
        userMetadata: { assetId: NONEXISTENT_ASSET },
        outputGroupDetails: [{ outputDetails: [{ durationInMs: 1000 }] }],
      },
    },
    headers: { "x-webhook-secret": process.env.AWS_VIDEO_WEBHOOK_SECRET || "unset" },
    cause: "lib/video/apply-job-event.ts:17-19 ignore unknown asset; route.ts:42 200",
  });
  add({
    route: "/api/video/webhook",
    method: "POST",
    role: "anon",
    scenario: "valid secret + oversized JSON (4xx, never 5xx)",
    path: "/api/video/webhook",
    expected: (status) => status < 500,
    expectedLabel: "not-5xx",
    rawBody: `{"detail":{"status":"COMPLETE","userMetadata":{"assetId":"${"A".repeat(50_000)}"}}`,
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": process.env.AWS_VIDEO_WEBHOOK_SECRET || "unset",
    },
    cause: "app/api/video/webhook/route.ts + mapMediaConvertJobEvent",
  });
  add({
    route: "/api/video/webhook",
    method: "POST",
    role: "anon",
    scenario: "valid secret + wrong content-type still verifies header",
    path: "/api/video/webhook",
    expected: [200, 401, 404],
    expectedLabel: "200|401|404",
    rawBody: JSON.stringify({
      detail: { status: "ERROR", userMetadata: { assetId: `${NONEXISTENT_ASSET}-2` } },
    }),
    headers: {
      "content-type": "text/plain",
      "x-webhook-secret": process.env.AWS_VIDEO_WEBHOOK_SECRET || "unset",
    },
    cause: "verifyWebhook reads raw text, not content-type",
  });

  // --- Stripe ---
  add({
    route: "/api/webhooks/stripe",
    method: "POST",
    role: "anon",
    scenario: "empty keys / unsigned body (document actual)",
    path: "/api/webhooks/stripe",
    expected: 401,
    body: { type: "checkout.session.completed" },
    cause: "lib/payments/stripe.ts:196 isConfigured() false → null → route.ts:26 401",
  });
  add({
    route: "/api/webhooks/stripe",
    method: "POST",
    role: "anon",
    scenario: "fake stripe-signature header",
    path: "/api/webhooks/stripe",
    expected: 401,
    rawBody: "{}",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
    cause: "lib/payments/stripe.ts:196-212",
  });
  add({
    route: "/api/webhooks/stripe",
    method: "POST",
    role: "anon",
    scenario: "malformed JSON unsigned",
    path: "/api/webhooks/stripe",
    expected: 401,
    rawBody: "{",
    headers: { "content-type": "application/json" },
    cause: "confirm returns null before Stripe parse when unconfigured / unsigned",
  });
  add({
    route: "/api/webhooks/stripe",
    method: "POST",
    role: "learner",
    scenario: "session cookie does not authorize webhook",
    path: "/api/webhooks/stripe",
    expected: 401,
    body: {},
    cookie: cookies.learner,
    cause: "stripe webhook ignores cookies",
  });

  // --- Certificate PDF ---
  add({
    route: "/certificates/[serial]/pdf",
    method: "GET",
    role: "anon",
    scenario: "nonexistent serial",
    path: `/certificates/${FAKE_CUID}/pdf`,
    expected: 404,
    cause: "app/(site)/certificates/[serial]/pdf/route.ts:13",
  });
  if (certSerial) {
    add({
      route: "/certificates/[serial]/pdf",
      method: "GET",
      role: "anon",
      scenario: "public existing serial",
      path: `/certificates/${certSerial}/pdf`,
      expected: 200,
      cause: "app/(site)/certificates/[serial]/pdf/route.ts:26",
      assert: (res) => {
        if (res.status === 200 && res.contentType && !res.contentType.includes("pdf")) {
          return `expected application/pdf, got ${res.contentType}`;
        }
        return undefined;
      },
    });
    add({
      route: "/certificates/[serial]/pdf",
      method: "GET",
      role: "learner",
      scenario: "existing serial signed-in still public",
      path: `/certificates/${certSerial}/pdf`,
      expected: 200,
      cookie: cookies.learner,
      cause: "PDF route has no auth gate",
    });
  }

  // --- Unknown API ---
  add({
    route: "/api/* (none)",
    method: "GET",
    role: "anon",
    scenario: "no extra app/api routes",
    path: "/api/does-not-exist",
    expected: 404,
    cause: "no matching route.ts",
  });

  return checks;
}

function curlRepro(check: Check): string {
  const parts = [`curl -sS -o NUL -w "%{http_code}" -X ${check.method}`];
  parts.push(`"${BASE}${check.path}"`);
  parts.push(`-H "origin: ${BASE}"`);
  if (check.headers) {
    for (const [key, value] of Object.entries(check.headers)) {
      const shown =
        key.toLowerCase() === "x-webhook-secret" ? "<AWS_VIDEO_WEBHOOK_SECRET>" : value;
      parts.push(`-H "${key}: ${shown}"`);
    }
  }
  if (check.cookie) parts.push(`-H "cookie: <session>"`);
  if (check.rawBody !== undefined) parts.push(`--data-binary '<${check.rawBody.length} bytes>'`);
  else if (check.body !== undefined) parts.push(`-H "content-type: application/json" --data '<json>'`);
  return parts.join(" ");
}

async function main(): Promise<number> {
  const webhookSecretSet = Boolean(process.env.AWS_VIDEO_WEBHOOK_SECRET);
  const stripeConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
  );

  await ensureAppUp();

  const learnerCookie = await signIn(ACCOUNTS.learner);
  const instructorCookie = await signIn(ACCOUNTS.instructor);
  const adminCookie = await signIn(ACCOUNTS.admin);
  const cookies = {
    learner: learnerCookie,
    instructor: instructorCookie,
    admin: adminCookie,
  };

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let captions: CaptionFixture | null = null;
  let certSerial: string | null = null;

  try {
    const loaded = await loadFixtures(pool);
    captions = loaded.captions;
    certSerial = loaded.certSerial;

    const checks = buildChecks({
      cookies,
      certSerial,
      captions,
      webhookSecretSet,
      stripeConfigured,
    });

    const rows: Row[] = [];
    for (const check of checks) {
      try {
        const res = await request(check.method, check.path, {
          body: check.body,
          rawBody: check.rawBody,
          headers: check.headers,
          cookie: check.cookie,
        });
        const statusPass = matches(check.expected, res.status);
        const fail5xx = res.status >= 500 && !matches(check.expected, res.status);
        const assertFail = check.assert?.(res);
        const pass = statusPass && !fail5xx && !assertFail;
        rows.push({
          route: check.route,
          method: check.method,
          role: check.role,
          scenario: check.scenario,
          expected: expectedLabel(check.expected, check.expectedLabel),
          actual: String(res.status),
          result: pass ? "PASS" : "FAIL",
          detail: pass ? undefined : assertFail || `unexpected status ${res.status}`,
          path: check.path,
          cause: check.cause,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        rows.push({
          route: check.route,
          method: check.method,
          role: check.role,
          scenario: check.scenario,
          expected: expectedLabel(check.expected, check.expectedLabel),
          actual: "ERR",
          result: "FAIL",
          detail: message,
          path: check.path,
          cause: check.cause,
        });
      }
    }

    // Rate / robustness: 20 sequential get-session, no 5xx.
    const rateStatuses: number[] = [];
    let rateFail = false;
    for (let i = 0; i < 20; i += 1) {
      try {
        const res = await request("GET", "/api/auth/get-session", { cookie: cookies.learner });
        rateStatuses.push(res.status);
        if (res.status >= 500) rateFail = true;
      } catch (error) {
        rateFail = true;
        rateStatuses.push(-1);
        rows.push({
          route: "/api/auth/[...all]",
          method: "GET",
          role: "learner",
          scenario: `get-session rapid #${i + 1}`,
          expected: "200",
          actual: "ERR",
          result: "FAIL",
          detail: error instanceof Error ? error.message : String(error),
          path: "/api/auth/get-session",
          cause: "rate/robustness smoke",
        });
      }
    }
    const rateUnique = [...new Set(rateStatuses.filter((s) => s > 0))];
    rows.push({
      route: "/api/auth/[...all]",
      method: "GET",
      role: "learner",
      scenario: "20 rapid sequential get-session (no 5xx)",
      expected: "200",
      actual: rateUnique.join(",") || "ERR",
      result: rateFail || rateStatuses.some((s) => s !== 200) ? "FAIL" : "PASS",
      detail: rateFail ? "saw 5xx or network error" : undefined,
      path: "/api/auth/get-session",
      cause: "better-auth get-session",
    });

    // Sign-out then session must be invalid (null session or 401). Use a
    // throwaway learner sign-in so sibling QA cookies stay intact.
    const throwaway = await signIn(ACCOUNTS.learner);
    const signOutRes = await request("POST", "/api/auth/sign-out", {
      body: {},
      cookie: throwaway,
    });
    rows.push({
      route: "/api/auth/[...all]",
      method: "POST",
      role: "learner",
      scenario: "sign-out current session",
      expected: "200",
      actual: String(signOutRes.status),
      result: signOutRes.status === 200 ? "PASS" : "FAIL",
      path: "/api/auth/sign-out",
      cause: "better-auth sign-out",
    });
    const after = await request("GET", "/api/auth/get-session", { cookie: throwaway });
    let afterOk = false;
    if (after.status === 401) afterOk = true;
    else if (after.status === 200) {
      try {
        const payload = JSON.parse(after.text) as { session?: unknown; user?: unknown };
        afterOk = payload === null || payload.session == null;
      } catch {
        afterOk = after.text === "null" || after.text.trim() === "";
      }
    }
    rows.push({
      route: "/api/auth/[...all]",
      method: "GET",
      role: "learner",
      scenario: "get-session after sign-out is invalid",
      expected: "200-null|401",
      actual: String(after.status),
      result: afterOk ? "PASS" : "FAIL",
      detail: afterOk ? undefined : after.text.slice(0, 120),
      path: "/api/auth/get-session",
      cause: "better-auth sign-out + get-session",
    });
    const listAfter = await request("GET", "/api/auth/list-sessions", { cookie: throwaway });
    rows.push({
      route: "/api/auth/[...all]",
      method: "GET",
      role: "learner",
      scenario: "list-sessions after sign-out requires auth",
      expected: "401",
      actual: String(listAfter.status),
      result: listAfter.status === 401 ? "PASS" : "FAIL",
      path: "/api/auth/list-sessions",
      cause: "better-auth list-sessions sessionMiddleware",
    });

    // Webhook must not create an asset for the fake id.
    const leaked = await pool.query(
      `SELECT COUNT(*)::int AS n FROM media_assets WHERE "providerAssetId" = $1`,
      [NONEXISTENT_ASSET],
    );
    const leakedN = leaked.rows[0]?.n ?? -1;
    rows.push({
      route: "/api/video/webhook",
      method: "POST",
      role: "anon",
      scenario: "fake COMPLETE did not insert media_assets row",
      expected: "0 rows",
      actual: `${leakedN} rows`,
      result: leakedN === 0 ? "PASS" : "FAIL",
      path: "/api/video/webhook",
      cause: "lib/video/apply-job-event.ts:17-19",
    });

    const nameW = Math.max(
      8,
      ...rows.map((row) => `${row.route} ${row.method} ${row.role} ${row.scenario}`.length),
    );
    void nameW;

    console.log(`GlobalMentor360v2 API full matrix  (${BASE})`);
    console.log("Stack: Next.js 16 App Router — no Express.");
    console.log(
      `Webhook secret configured: ${webhookSecretSet ? "yes" : "no"}  Stripe keys configured: ${stripeConfigured ? "yes" : "no"}  (values not printed)`,
    );
    console.log(
      `Caption fixtures: ${captions ? "inserted on typescript-foundations preview+locked lectures (restored after)" : "unavailable"}`,
    );
    console.log(`Certificate serial present: ${certSerial ? "yes" : "no"}\n`);

    const header = [
      "ROUTE".padEnd(32),
      "METHOD".padEnd(7),
      "ROLE".padEnd(11),
      "SCENARIO".padEnd(62),
      "EXPECTED".padEnd(12),
      "ACTUAL".padEnd(8),
      "RESULT",
    ].join("  ");
    console.log(header);
    console.log("-".repeat(header.length));

    let failed = 0;
    const failures: { row: Row; check?: Check }[] = [];
    for (const row of rows) {
      if (row.result === "FAIL") {
        failed += 1;
        failures.push({ row });
      }
      console.log(
        `${row.route.padEnd(32)}  ${row.method.padEnd(7)}  ${row.role.padEnd(11)}  ${row.scenario.padEnd(62)}  ${row.expected.padEnd(12)}  ${row.actual.padEnd(8)}  ${row.result}${row.detail ? `  ${row.detail}` : ""}`,
      );
    }

    console.log("");
    console.log(`PASS ${rows.length - failed}  FAIL ${failed}  TOTAL ${rows.length}`);

    if (failures.length > 0) {
      console.log("\n--- FAIL details (no secrets) ---");
      for (const { row } of failures) {
        const check = checks.find(
          (c) =>
            c.route === row.route &&
            c.method === row.method &&
            c.role === row.role &&
            c.scenario === row.scenario,
        );
        console.log(`FAIL  ${row.route}  ${row.method}  ${row.role}  ${row.scenario}`);
        console.log(`  expected ${row.expected}  actual ${row.actual}  ${row.detail ?? ""}`);
        console.log(`  suspected: ${row.cause ?? "unknown"}`);
        if (check) console.log(`  repro: ${curlRepro(check)}`);
      }
    }

    console.log("\nPrior verify:apis coverage gaps this script adds:");
    console.log("  - role×method sweep on all 5 physical handlers");
    console.log("  - caption entitlement (preview vs locked) with DB fixtures");
    console.log("  - certificate PDF happy path");
    console.log("  - signed video webhook with fake nonexistent asset (no MediaConvert)");
    console.log("  - Stripe empty-key / malformed / fake signature");
    console.log("  - Better Auth reset/change-email/change-password/sign-up negative paths");
    console.log("  - sign-out invalidates session; 20× get-session smoke");

    return failed > 0 ? 1 : 0;
  } finally {
    try {
      await restoreFixtures(pool, captions);
    } finally {
      await pool.end();
    }
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
