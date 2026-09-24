/**
 * HTTP page matrix for GlobalMentor360v2.
 *
 * Fetches real App Router HTML (not Playwright). Mutating payment forms are
 * skipped except one bKash proof + admin approve/reject against vol- fixtures.
 *
 *   npx tsx scripts/verify-pages.ts
 *   VERIFY_API_BASE_URL=http://localhost:3001 npx tsx scripts/verify-pages.ts
 */
import "dotenv/config";
import { addToCart } from "../lib/cart";
import { db } from "../lib/db";
import { isEnrolled } from "../lib/entitlement";
import {
  approveManualPayment,
  bkashManualRail,
  rejectManualPayment,
} from "../lib/payments";

process.env.EMAIL_FROM = "";

const BASE =
  process.env.VERIFY_API_BASE_URL?.replace(/\/$/, "") ||
  process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3001";

const SEED_PASSWORD = "dev-password-12345";
const ACCOUNTS = {
  learner: "learner@example.com",
  instructor: "instructor@example.com",
  admin: "admin@example.com",
  vol: "vol-learner@example.com",
} as const;

const EMPTY_EMAIL = "verify-empty@example.com";

type Persona =
  | "anonymous"
  | "empty"
  | "learner"
  | "vol"
  | "instructor"
  | "admin";

type Row = {
  persona: Persona;
  page: string;
  result: "PASS" | "FAIL";
  note: string;
};

const rows: Row[] = [];

type Fetched = {
  status: number;
  html: string;
  location: string | null;
  setCookies: string[];
};

function cookieHeader(setCookies: string[]): string {
  return setCookies
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

function visibleHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

/** React SSR inserts comments between interpolations (`page <!-- -->1 of <!-- -->2`). */
function flatten(html: string): string {
  return visibleHtml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMain(html: string): string | null {
  const match = visibleHtml(html).match(/<main\b[\s\S]*?<\/main>/i);
  return match ? match[0] : null;
}

function titlesIn(html: string): string[] {
  const found: string[] = [];
  const re = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi;
  for (const match of html.matchAll(re)) {
    const text = match[1]?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text) found.push(text);
  }
  return found;
}

function hasErrorText(html: string): string | null {
  const visible = visibleHtml(html);
  if (/Application error/i.test(visible)) return "Application error";
  if (/Internal Server Error/i.test(visible)) return "Internal Server Error";
  if (/A server-side exception/i.test(visible)) return "server-side exception";
  const main = extractMain(html);
  if (main && />Error:</.test(main)) return "raw Error: in main";
  return null;
}

function record(persona: Persona, page: string, result: "PASS" | "FAIL", note: string) {
  rows.push({ persona, page, result, note });
}

async function request(
  path: string,
  opts: {
    method?: string;
    cookie?: string;
    body?: unknown;
    form?: Record<string, string>;
    redirect?: RequestRedirect;
    headers?: Record<string, string>;
  } = {},
): Promise<Fetched> {
  const headers: Record<string, string> = {
    origin: BASE,
    accept: "text/html,application/json",
    ...opts.headers,
  };
  if (opts.cookie) headers.cookie = opts.cookie;

  let body: string | FormData | undefined;
  if (opts.form) {
    const params = new URLSearchParams(opts.form);
    body = params.toString();
    headers["content-type"] = "application/x-www-form-urlencoded";
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    if (!headers["content-type"]) headers["content-type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
    redirect: opts.redirect ?? "manual",
  });

  const html = await res.text();
  return {
    status: res.status,
    html,
    location: res.headers.get("location"),
    setCookies: res.headers.getSetCookie(),
  };
}

async function getPage(path: string, cookie?: string, follow = true): Promise<Fetched> {
  const first = await request(path, { cookie, redirect: "manual" });
  if (
    follow &&
    first.location &&
    (first.status === 301 || first.status === 302 || first.status === 303 || first.status === 307 || first.status === 308)
  ) {
    const nextPath = first.location.startsWith("http")
      ? new URL(first.location).pathname + new URL(first.location).search
      : first.location;
    const second = await request(nextPath, { cookie, redirect: "manual" });
    return second;
  }
  return first;
}

function assertPage(
  persona: Persona,
  page: string,
  fetched: Fetched,
  opts: {
    expectStatus?: number | number[];
    expectRedirectTo?: RegExp;
    mustInclude?: string[];
    mustNotInclude?: string[];
    requireMain?: boolean;
    extra?: (html: string, text: string) => string | null;
  } = {},
): boolean {
  const expected = opts.expectStatus ?? 200;
  const statusOk = Array.isArray(expected)
    ? expected.includes(fetched.status)
    : fetched.status === expected;

  if (opts.expectRedirectTo) {
    const loc = fetched.location ?? "";
    const redirectOk =
      (fetched.status === 302 || fetched.status === 303 || fetched.status === 307 || fetched.status === 308) &&
      opts.expectRedirectTo.test(loc);
    if (!redirectOk) {
      record(
        persona,
        page,
        "FAIL",
        `expected redirect ${opts.expectRedirectTo} got ${fetched.status} ${loc}`,
      );
      return false;
    }
    record(persona, page, "PASS", `redirect ${fetched.status} ${loc}`);
    return true;
  }

  if (!statusOk) {
    record(persona, page, "FAIL", `HTTP ${fetched.status}`);
    return false;
  }

  const err = hasErrorText(fetched.html);
  if (err) {
    record(persona, page, "FAIL", err);
    return false;
  }

  const text = flatten(fetched.html);

  if (opts.requireMain !== false && fetched.status === 200) {
    const main = extractMain(fetched.html);
    if (!main) {
      record(persona, page, "FAIL", "missing <main>");
      return false;
    }
    if (flatten(main).length < 8) {
      record(persona, page, "FAIL", "empty <main>");
      return false;
    }
  }

  for (const needle of opts.mustInclude ?? []) {
    if (!text.includes(needle) && !fetched.html.includes(needle)) {
      record(persona, page, "FAIL", `missing "${needle}"`);
      return false;
    }
  }
  for (const needle of opts.mustNotInclude ?? []) {
    if (text.includes(needle)) {
      record(persona, page, "FAIL", `unexpected "${needle}"`);
      return false;
    }
  }
  if (opts.extra) {
    const extraFail = opts.extra(fetched.html, text);
    if (extraFail) {
      record(persona, page, "FAIL", extraFail);
      return false;
    }
  }

  record(persona, page, "PASS", opts.mustInclude?.join(" · ") || `HTTP ${fetched.status}`);
  return true;
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: SEED_PASSWORD }),
  });
  if (res.status !== 200) {
    throw new Error(`Sign-in failed for ${email} (HTTP ${res.status}).`);
  }
  const cookie = cookieHeader(res.headers.getSetCookie());
  if (!cookie) throw new Error(`Sign-in for ${email} returned no session cookie.`);
  return cookie;
}

async function ensureEmptyUser(): Promise<string> {
  const existing = await db.user.findUnique({ where: { email: EMPTY_EMAIL } });
  if (!existing) {
    const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({
        name: "Empty Verify",
        email: EMPTY_EMAIL,
        password: SEED_PASSWORD,
      }),
    });
    if (res.status !== 200 && res.status !== 201) {
      const body = await res.text();
      throw new Error(`Empty-user sign-up failed (HTTP ${res.status}). ${body.slice(0, 200)}`);
    }
  }

  const user = await db.user.findUniqueOrThrow({ where: { email: EMPTY_EMAIL } });
  await db.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  await db.enrollment.deleteMany({ where: { userId: user.id } });
  await db.notification.deleteMany({ where: { userId: user.id } });
  await db.order.deleteMany({ where: { userId: user.id } }).catch(async () => {
    const orders = await db.order.findMany({ where: { userId: user.id }, select: { id: true } });
    const ids = orders.map((order) => order.id);
    if (ids.length > 0) {
      await db.payment.deleteMany({ where: { orderId: { in: ids } } });
      await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await db.order.deleteMany({ where: { id: { in: ids } } });
    }
  });
  await db.cart.deleteMany({ where: { userId: user.id } });
  return signIn(EMPTY_EMAIL);
}

async function ensureAppUp(): Promise<void> {
  try {
    const res = await fetch(BASE, { redirect: "manual" });
    if (res.status >= 500) throw new Error(`App at ${BASE} returned ${res.status}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot reach ${BASE}. ${message}`);
  }
}

type Fixtures = {
  certSerial: string;
  bigSlug: string;
  bigId: string;
  qaItemId: string;
  buySlug: string;
  buyId: string;
  buyAmount: number;
  studioCourseId: string;
  rejectPaymentId: string;
  rejectTxn: string;
  volLearnerId: string;
  adminId: string;
};

async function loadFixtures(): Promise<Fixtures> {
  const cert = await db.certificate.findFirst({ select: { serial: true } });
  if (!cert) throw new Error("No certificate serial in the database.");

  const big = await db.course.findUnique({
    where: { slug: "vol-big-course" },
    select: {
      id: true,
      slug: true,
      sections: {
        orderBy: { position: "asc" },
        select: { items: { orderBy: { position: "asc" }, select: { id: true } } },
      },
    },
  });
  if (!big) throw new Error("vol-big-course missing. Run npx tsx scripts/seed-volume.ts");

  const qaItemId = big.sections[0]?.items[0]?.id;
  if (!qaItemId) throw new Error("vol-big-course has no curriculum items.");

  const volLearner = await db.user.findUniqueOrThrow({
    where: { email: ACCOUNTS.vol },
    select: { id: true },
  });
  const admin = await db.user.findUniqueOrThrow({
    where: { email: ACCOUNTS.admin },
    select: { id: true },
  });
  const instructor = await db.user.findUniqueOrThrow({
    where: { email: ACCOUNTS.instructor },
    select: { id: true },
  });

  const buy = await db.course.findFirst({
    where: {
      slug: { startsWith: "vol-catalog-" },
      status: "PUBLISHED",
      prices: { some: { isActive: true, currency: "BDT", amount: { gt: 0 } } },
      enrollments: { none: { userId: volLearner.id, revokedAt: null } },
    },
    select: {
      id: true,
      slug: true,
      prices: { where: { isActive: true, currency: "BDT" }, select: { amount: true } },
    },
    orderBy: { slug: "asc" },
  });
  if (!buy) throw new Error("No unenrolled paid vol- catalog course for the bKash probe.");
  const buyAmount = buy.prices[0]?.amount;
  if (!buyAmount) throw new Error(`No BDT price on ${buy.slug}`);

  const studio = await db.course.findFirst({
    where: { instructorId: instructor.id, slug: { startsWith: "vol-" } },
    select: { id: true },
  });
  if (!studio) throw new Error("No vol- course for studio.");

  const reject = await db.payment.findFirst({
    where: {
      status: "PENDING_VERIFICATION",
      bkashTransactionId: { startsWith: "VOLTXN" },
      userId: { not: volLearner.id },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, bkashTransactionId: true },
  });
  if (!reject?.bkashTransactionId) throw new Error("No vol- pending payment to reject.");

  return {
    certSerial: cert.serial,
    bigSlug: big.slug,
    bigId: big.id,
    qaItemId,
    buySlug: buy.slug,
    buyId: buy.id,
    buyAmount,
    studioCourseId: studio.id,
    rejectPaymentId: reject.id,
    rejectTxn: reject.bkashTransactionId,
    volLearnerId: volLearner.id,
    adminId: admin.id,
  };
}

async function main(): Promise<number> {
  await ensureAppUp();
  const fx = await loadFixtures();

  const emptyCookie = await ensureEmptyUser();
  const learnerCookie = await signIn(ACCOUNTS.learner);
  const volCookie = await signIn(ACCOUNTS.vol);
  const instructorCookie = await signIn(ACCOUNTS.instructor);
  const adminCookie = await signIn(ACCOUNTS.admin);

  // --- anonymous public ---
  assertPage("anonymous", "/", await getPage("/"), {
    mustInclude: ["Learn with structure"],
  });

  const catalog1 = await getPage("/courses");
  assertPage("anonymous", "/courses", catalog1, {
    mustInclude: ["Showing 1–48 of"],
    extra: (html, text) => {
      if (!text.includes("page 1 of")) return "missing PageNav on catalog page 1";
      return null;
    },
  });
  const catalog1Titles = titlesIn(catalog1.html);

  const catalog2 = await getPage("/courses?page=2");
  assertPage("anonymous", "/courses?page=2", catalog2, {
    extra: (html, text) => {
      if (!/Showing 49–\d+ of \d+/.test(text)) return "bad showing-range on page 2";
      const t2 = titlesIn(html);
      const overlap = t2.filter((title) => catalog1Titles.includes(title));
      if (t2.length === 0) return "no titles on catalog page 2";
      if (overlap.length === t2.length) return "page 2 titles identical to page 1";
      return null;
    },
  });

  const search1 = await getPage("/courses?q=vol-");
  assertPage("anonymous", "/courses?q=vol-", search1, {
    mustInclude: ["vol-"],
    extra: (html, text) => {
      if (!text.includes("page 1 of")) return "search should paginate vol- courses";
      if (!html.includes("page=2") || !html.includes("q=vol-")) {
        return "PageNav dropped q= on search pagination";
      }
      return null;
    },
  });

  const search2 = await getPage("/courses?q=vol-&page=2");
  assertPage("anonymous", "/courses?q=vol-&page=2", search2, {
    extra: (html, text) => {
      const t1 = titlesIn(search1.html);
      const t2 = titlesIn(html);
      if (t2.length === 0) return "no titles on search page 2";
      if (t2.every((title) => t1.includes(title))) return "search page 2 not distinct";
      return null;
    },
  });

  assertPage("anonymous", `/courses/${fx.bigSlug}`, await getPage(`/courses/${fx.bigSlug}`), {
    mustInclude: [
      "vol- Big Course",
      "Showing the 20 most recent reviews of 45",
      " reviews",
    ],
    extra: (html, text) => {
      if (!text.includes("%")) return "missing rating histogram percents";
      return null;
    },
  });

  assertPage(
    "anonymous",
    `/certificates/${fx.certSerial}`,
    await getPage(`/certificates/${fx.certSerial}`),
    { mustInclude: ["Certificate of completion", fx.certSerial] },
  );

  assertPage("anonymous", "/sign-in", await getPage("/sign-in"), {
    mustInclude: ["Welcome back"],
  });
  assertPage("anonymous", "/sign-up", await getPage("/sign-up"), {
    extra: (html, text) => (text.includes("Create") || text.includes("Sign up") || text.includes("sign up")
      ? null
      : "sign-up copy missing"),
  });
  assertPage("anonymous", "/forgot-password", await getPage("/forgot-password"), {
    mustInclude: ["Reset your password"],
  });

  for (const path of ["/dashboard", "/cart", "/notifications", "/orders", "/account", "/studio", "/admin"]) {
    const fetched = await request(path, { redirect: "manual" });
    assertPage("anonymous", path, fetched, { expectRedirectTo: /\/sign-in/ });
  }

  // --- empty user ---
  assertPage("empty", "/dashboard", await getPage("/dashboard", emptyCookie), {
    mustInclude: ["haven't enrolled", "Browse courses"],
  });
  assertPage("empty", "/cart", await getPage("/cart", emptyCookie), {
    mustInclude: ["Your cart is empty."],
  });
  assertPage("empty", "/notifications", await getPage("/notifications", emptyCookie), {
    mustInclude: ["Nothing yet."],
  });
  assertPage("empty", "/orders", await getPage("/orders", emptyCookie), {
    extra: (html, text) =>
      text.includes("haven") && text.includes("bought") ? null : "empty orders box missing",
  });
  assertPage("empty", "/account", await getPage("/account", emptyCookie), {
    mustInclude: ["Account", "Password"],
  });

  // --- some (seed learner) ---
  assertPage("learner", "/dashboard", await getPage("/dashboard", learnerCookie), {
    extra: (_html, text) => {
      // Seed learner has finished TypeScript Foundations, so the default tab is
      // empty and Radix does not SSR the completed-tab card (no "100%" in HTML).
      if (!/Completed \(\s*[1-9]/.test(text) && !/In progress \(\s*[1-9]/.test(text)) {
        return "missing enrollment count on dashboard tabs";
      }
      return null;
    },
  });
  assertPage("learner", "/account", await getPage("/account", learnerCookie), {
    mustInclude: ["Account"],
  });
  assertPage("learner", "/orders", await getPage("/orders", learnerCookie), {
    extra: (html, text) => (extractMain(html) ? null : "orders main missing"),
  });

  // --- many (vol learner) ---
  assertPage("vol", "/dashboard", await getPage("/dashboard", volCookie), {
    extra: (html, text) => {
      if (!text.includes("vol- Big Course") && !text.includes("vol- Catalog")) {
        return "missing vol enrollments";
      }
      if (!text.includes("%")) return "missing progress percents";
      if (!text.includes("9+")) return "header bell missing count-only 9+ badge";
      return null;
    },
  });

  const orders1 = await getPage("/orders", volCookie);
  assertPage("vol", "/orders", orders1, {
    mustInclude: ["page 1 of 2"],
  });
  const orderTitleRe = /<p class="truncate font-medium"[^>]*>([\s\S]*?)<\/p>/g;
  const orderTitles1 = titlesIn(orders1.html).concat(
    [...orders1.html.matchAll(orderTitleRe)].map((m) =>
      (m[1] ?? "").replace(/<[^>]+>/g, "").replace(/<!--[\s\S]*?-->/g, "").trim(),
    ),
  );

  const orders2 = await getPage("/orders?page=2", volCookie);
  assertPage("vol", "/orders?page=2", orders2, {
    extra: (html, text) => {
      if (!text.includes("page 2 of")) return "missing page 2 of N";
      const t2 = [...html.matchAll(orderTitleRe)].map((m) =>
        (m[1] ?? "").replace(/<[^>]+>/g, "").replace(/<!--[\s\S]*?-->/g, "").trim(),
      );
      if (t2.length === 0) return "no order rows on page 2";
      const overlap = t2.filter((title) => orderTitles1.includes(title));
      if (overlap.length === t2.length) return "order page 2 rows not distinct";
      return null;
    },
  });

  const n1 = await getPage("/notifications", volCookie);
  assertPage("vol", "/notifications", n1, {
    mustInclude: ["page 1 of 3"],
  });
  const n2 = await getPage("/notifications?page=2", volCookie);
  assertPage("vol", "/notifications?page=2", n2, {
    extra: (_html, text) => (text.includes("page 2 of 3") ? null : "notifications page 2 marker missing"),
  });
  const n3 = await getPage("/notifications?page=3", volCookie);
  assertPage("vol", "/notifications?page=3", n3, {
    extra: (_html, text) => (text.includes("page 3 of 3") ? null : "notifications page 3 marker missing"),
  });

  const learn = await getPage(`/learn/${fx.bigSlug}/${fx.qaItemId}`, volCookie);
  assertPage("vol", `/learn/${fx.bigSlug}/[itemId]`, learn, {
    mustInclude: [
      "vol- Lecture 1",
      "Your progress",
      "VOL_CURRENT_BODY_A",
      "10 earlier replies",
      "vol- Announcement",
    ],
    mustNotInclude: ["VOL_CURRENT_BODY_B"],
    extra: (_html, text) => {
      if (!text.includes("vol- Lecture 2")) return "outline missing other lectures";
      return null;
    },
  });

  // Cart add + quote (GET /cart after add). Server actions are not REST;
  // the cart write uses the same service the form action calls.
  const added = await addToCart(fx.volLearnerId, fx.buyId);
  if (!added.ok) {
    record("vol", "/cart add", "FAIL", added.message);
  } else {
    record("vol", "/cart add", "PASS", fx.buySlug);
  }
  const cartPage = await getPage("/cart", volCookie);
  assertPage("vol", "/cart (quote)", cartPage, {
    extra: (_html, text) => {
      if (!text.includes("vol- Catalog") && !text.includes(fx.buySlug)) {
        return "added course missing from cart";
      }
      if (!text.includes("Checkout with bKash") && !text.includes("Amount to send")) {
        return "bKash quote missing";
      }
      return null;
    },
  });

  // --- instructor ---
  assertPage("instructor", "/studio", await getPage("/studio", instructorCookie), {
    mustInclude: ["Studio", "vol- Big Course"],
  });
  const qa1 = await getPage("/studio/qa", instructorCookie);
  assertPage("instructor", "/studio/qa", qa1, {
    extra: (_html, text) => (text.includes("page 1 of") ? null : "studio/qa pager missing"),
  });
  const qa2 = await getPage("/studio/qa?page=2", instructorCookie);
  assertPage("instructor", "/studio/qa?page=2", qa2, {
    extra: (_html, text) => {
      if (!text.includes("page 2 of")) return "studio/qa page 2 marker missing";
      return null;
    },
  });
  assertPage(
    "instructor",
    `/studio/courses/${fx.studioCourseId}`,
    await getPage(`/studio/courses/${fx.studioCourseId}`, instructorCookie),
    { mustInclude: ["Readiness"] },
  );
  assertPage("instructor", "/studio/announcements", await getPage("/studio/announcements", instructorCookie), {
    mustInclude: ["Announcements", "vol- Announcement"],
  });
  assertPage("instructor", "/studio/coupons", await getPage("/studio/coupons", instructorCookie), {
    mustInclude: ["Coupons"],
  });

  // --- admin ---
  const adminIndex = await request("/admin", { cookie: adminCookie, redirect: "manual" });
  assertPage("admin", "/admin", adminIndex, { expectRedirectTo: /\/admin\/payments/ });

  assertPage("admin", "/admin/users?page=2", await getPage("/admin/users?page=2", adminCookie), {
    extra: (html, text) => {
      if (!text.includes("page 2 of")) return "users pager missing";
      if (!text.includes("vol-") && !html.includes("vol-user-") && !text.includes("@example.com")) {
        return "page 2 has no recognisable users";
      }
      return null;
    },
  });
  assertPage("admin", "/admin/courses", await getPage("/admin/courses", adminCookie), {
    extra: (_html, text) => (text.includes("vol-") || text.includes("TypeScript") ? null : "no courses listed"),
  });
  assertPage("admin", "/admin/reviews", await getPage("/admin/reviews", adminCookie), {
    extra: (_html, text) => (text.includes("vol- review") || text.includes("Reviews") ? null : "reviews page empty/crash"),
  });

  const pay1 = await getPage("/admin/payments", adminCookie);
  assertPage("admin", "/admin/payments", pay1, {
    extra: (_html, text) => {
      const awaiting = text.match(/(\d+) awaiting/);
      const total = awaiting ? Number(awaiting[1]) : 0;
      // Queue page size is 20; page 2 exists when total > 20 (seed has 40 pending).
      if (total <= 20) return `expected payments page 2 (total>20), got ${total}`;
      if (!/Showing 1–20 of \d+/.test(text)) return "payments showing-range missing";
      if (!text.includes("page 1 of")) return "payments pager missing";
      if (!text.includes("VOLTXN")) return "vol trx ids missing on page 1";
      return null;
    },
  });
  const pay2 = await getPage("/admin/payments?page=2", adminCookie);
  assertPage("admin", "/admin/payments?page=2", pay2, {
    extra: (_html, text) => {
      if (!text.includes("page 2 of")) return "payments page 2 marker missing";
      if (!text.includes("VOLTXN")) return "page 2 missing vol trx";
      return null;
    },
  });
  assertPage("admin", "/admin/refunds", await getPage("/admin/refunds", adminCookie), {
    extra: (html, text) => (extractMain(html) ? null : "refunds main missing"),
  });

  // --- bKash E2E: checkout page renders, proof is recorded, admin approves ---
  assertPage(
    "vol",
    `/courses/${fx.buySlug}/checkout`,
    await getPage(`/courses/${fx.buySlug}/checkout`, volCookie),
    {
      extra: (_html, text) =>
        text.includes("transaction") || text.includes("bKash")
          ? null
          : "checkout missing bKash proof form",
    },
  );

  const e2eTxn = `VOLTXNE2E${Date.now().toString(36).toUpperCase()}`;
  let submitted = false;
  try {
    await bkashManualRail.submitProof({
      userId: fx.volLearnerId,
      items: [{ courseId: fx.buyId, unitPrice: fx.buyAmount, discountApplied: 0 }],
      amount: fx.buyAmount,
      proof: {
        transactionId: e2eTxn,
        phoneNumber: "01712345678",
        paymentDate: new Date().toISOString().slice(0, 10),
        reference: "vol- e2e",
      },
    });
    submitted = true;
    record("vol", "bKash submit", "PASS", e2eTxn);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record("vol", "bKash submit", "FAIL", message);
  }

  if (submitted) {
    const queued = await db.payment.findFirst({
      where: { bkashTransactionId: e2eTxn },
      select: { id: true, amount: true },
    });
    if (!queued) {
      record("admin", "bKash approve", "FAIL", "payment row missing after submit");
    } else {
      const approve = await approveManualPayment({
        paymentId: queued.id,
        adminId: fx.adminId,
        notes: "vol- e2e approve",
      });
      if (!approve.ok) {
        record("admin", "bKash approve", "FAIL", approve.message);
      } else {
        record("admin", "bKash approve", "PASS", approve.message);
        const enrolled = await isEnrolled(fx.volLearnerId, fx.buyId);
        record(
          "vol",
          "enrollment after approve",
          enrolled ? "PASS" : "FAIL",
          enrolled ? fx.buySlug : "still not enrolled",
        );
        const dash = await getPage("/dashboard", volCookie);
        assertPage("vol", "/dashboard after approve", dash, {
          extra: (_html, text) => (text.includes(fx.buySlug) || text.includes("vol- Catalog") ? null : "new course not on dashboard"),
        });
      }
    }
  }

  const rejected = await rejectManualPayment({
    paymentId: fx.rejectPaymentId,
    adminId: fx.adminId,
    notes: "vol- e2e reject",
  });
  if (!rejected.ok) {
    record("admin", "bKash reject", "FAIL", rejected.message);
  } else {
    const row = await db.payment.findUnique({
      where: { id: fx.rejectPaymentId },
      select: { status: true },
    });
    record(
      "admin",
      "bKash reject",
      row?.status === "FAILED" ? "PASS" : "FAIL",
      `status=${row?.status} txn=${fx.rejectTxn}`,
    );
  }

  const passed = rows.filter((row) => row.result === "PASS").length;
  const failed = rows.filter((row) => row.result === "FAIL").length;
  const nameWidth = Math.max(12, ...rows.map((row) => row.page.length));

  console.log(`GlobalMentor360v2 page verification  (${BASE})\n`);
  console.log(
    `${"PERSONA".padEnd(12)}  ${"PAGE".padEnd(nameWidth)}  RESULT  NOTE`,
  );
  console.log("-".repeat(nameWidth + 28));
  for (const row of rows) {
    console.log(
      `${row.persona.padEnd(12)}  ${row.page.padEnd(nameWidth)}  ${row.result.padEnd(4)}  ${row.note}`,
    );
  }
  console.log("");
  console.log(`${passed} passed, ${failed} failed, ${rows.length} checks.`);
  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
