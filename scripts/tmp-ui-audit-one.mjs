const base = process.argv[2] || "http://localhost:3000";
const path = process.argv[3] || "/certificates/not-a-real-serial";
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), 25000);
const t0 = Date.now();
try {
  const r = await fetch(base + path, { redirect: "manual", signal: ac.signal });
  const text = await r.text();
  const title = (text.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
  const h1 = (text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/\s+/g, " ").trim() || "";
  const markers = [
    "Certificate not found",
    "Page not found",
    "This page could not be found",
    "Nothing yet.",
    "No payment methods available",
    "Browse courses",
    "cannot be bought",
  ].filter((s) => text.includes(s));
  console.log(
    JSON.stringify({
      ms: Date.now() - t0,
      status: r.status,
      loc: r.headers.get("location"),
      title,
      h1,
      markers,
    }),
  );
} catch (e) {
  console.log(JSON.stringify({ ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) }));
} finally {
  clearTimeout(t);
}
