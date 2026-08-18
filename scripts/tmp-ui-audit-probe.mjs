const base = process.argv[2] || "http://127.0.0.1:3000";

function has(html, s) {
  return html.includes(s);
}

async function show(path, cookie) {
  const r = await fetch(base + path, {
    redirect: "manual",
    headers: cookie ? { cookie, origin: "http://localhost:3000" } : { origin: "http://localhost:3000" },
  });
  const loc = r.headers.get("location") || "";
  const ct = (r.headers.get("content-type") || "").split(";")[0];
  let flags = "";
  if (!path.endsWith("/pdf") && ct.includes("html")) {
    const t = await r.text();
    flags = [
      has(t, "Certificate not found") && "cert-copy",
      has(t, "Page not found") && "page-copy",
      has(t, "This page could not be found") && "next-default",
      has(t, "Nothing yet.") && "nothing-yet",
      has(t, "No payment methods available") && "no-pay",
      has(t, "cannot be bought") && "cannot-buy",
      has(t, "Browse courses") && "browse",
    ]
      .filter(Boolean)
      .join(",");
  } else {
    await r.arrayBuffer();
  }
  console.log(`${r.status} ${path}${loc ? ` -> ${loc}` : ""} ${ct} ${flags}`);
}

console.log("=== anonymous", base, "===");
for (const p of [
  "/courses/this-slug-does-not-exist",
  "/certificates/not-a-real-serial",
  "/certificates/not-a-real-serial/pdf",
  "/this-route-does-not-exist",
  "/courses/qa-studio-draft-xdpiiq",
  "/courses/postgres-for-application-developers",
]) {
  await show(p);
}

const login = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { origin: "http://localhost:3000", "content-type": "application/json" },
  body: JSON.stringify({ email: "learner@example.com", password: "dev-password-12345" }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
console.log("=== learner", login.status, cookie ? "cookie" : "no-cookie", "===");

for (const p of [
  "/notifications",
  "/courses/postgres-for-application-developers/checkout",
  "/courses/qa-studio-draft-xdpiiq",
  "/learn/qa-studio-draft-xdpiiq",
  "/courses/this-slug-does-not-exist",
]) {
  await show(p, cookie);
}
