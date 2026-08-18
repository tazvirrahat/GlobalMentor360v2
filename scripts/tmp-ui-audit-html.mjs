const base = process.argv[2] || "http://localhost:3001";
const path = process.argv[3] || "/certificates/not-a-real-serial";
const cookie = process.argv[4] || "";
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), 30000);
const t0 = Date.now();
try {
  const r = await fetch(base + path, {
    redirect: "manual",
    signal: ac.signal,
    headers: cookie ? { cookie } : {},
  });
  const text = await r.text();
  const h1s = [...text.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
  const title = (text.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
  const stripped = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  console.log(
    JSON.stringify(
      {
        ms: Date.now() - t0,
        status: r.status,
        loc: r.headers.get("location"),
        title,
        h1s,
        stripped,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.log(JSON.stringify({ ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) }));
} finally {
  clearTimeout(t);
}
