const BASE = "http://localhost:3001";
const PASSWORD = "dev-password-12345";

function cookieHeader(setCookies) {
  return setCookies
    .map((entry) => entry.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function signIn(email) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const cookie = cookieHeader(res.headers.getSetCookie());
  return { status: res.status, cookie };
}

function extract(html, re) {
  const out = [];
  for (const m of html.matchAll(re)) out.push(m[1] ?? m[0]);
  return out;
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie, origin: BASE } : { origin: BASE },
    redirect: "manual",
  });
  const html = await res.text();
  return { status: res.status, loc: res.headers.get("location"), len: html.length, html };
}

function titles(html) {
  return extract(html, /<h3[^>]*>([^<]+)<\/h3>/g);
}

function noteTitles(html) {
  return [...html.matchAll(/You're enrolled|QA studio ping[^<]*|Section 4 is live|Nothing yet|You're up to date|unread/g)].map(
    (m) => m[0],
  );
}

const { status: ls, cookie: learner } = await signIn("learner@example.com");
const { status: is, cookie: instructor } = await signIn("instructor@example.com");
console.log("signin", { learner: ls, instructor: is, learnerCookie: Boolean(learner), instructorCookie: Boolean(instructor) });

const learnerNotif = await get("/notifications", learner);
const instructorNotif = await get("/notifications", instructor);
const learnerHome = await get("/", learner);
const instructorHome = await get("/", instructor);

console.log("learner /notifications", {
  status: learnerNotif.status,
  loc: learnerNotif.loc,
  hits: noteTitles(learnerNotif.html),
  hasQaPing: learnerNotif.html.includes("QA studio ping"),
  hasNothing: learnerNotif.html.includes("Nothing yet"),
});
console.log("instructor /notifications", {
  status: instructorNotif.status,
  loc: instructorNotif.loc,
  hits: noteTitles(instructorNotif.html),
  hasQaPing: instructorNotif.html.includes("QA studio ping"),
  hasNothing: instructorNotif.html.includes("Nothing yet"),
});
console.log("bell leak check", {
  learnerHomeHasQa: learnerHome.html.includes("QA studio ping"),
  instructorHomeHasQa: instructorHome.html.includes("QA studio ping"),
});

for (const path of [
  "/courses?q=typescript",
  "/courses?q=typescript&price=paid",
  "/courses?q=typescript&level=BEGINNER",
  "/courses?q=typescript&price=free",
  "/courses?q=typescript&category=web-development",
  "/courses?q=" + encodeURIComponent("typescript'; DROP TABLE courses; --"),
]) {
  const page = await get(path);
  const found = titles(page.html);
  console.log(path, {
    status: page.status,
    titles: found.filter((t) => /TypeScript|SQL|Postgres|Draft|qa-curr|qa-uc8/i.test(t)),
    hasDraft: /qa-curr-audit|QA Studio Draft|qa-uc8/i.test(page.html),
    hasTs: page.html.includes("TypeScript Foundations"),
    hasSql: page.html.includes("SQL for Analysts"),
  });
}
