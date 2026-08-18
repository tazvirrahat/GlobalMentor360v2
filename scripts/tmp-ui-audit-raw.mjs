const base = process.argv[2] || "http://localhost:3001";
const path = process.argv[3] || "/certificates/not-a-real-serial";
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), 40000);
try {
  const r = await fetch(base + path, { redirect: "manual", signal: ac.signal });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString("utf8");
  console.log("status", r.status, "bytes", buf.length, "ct", r.headers.get("content-type"));
  console.log("--- head ---");
  console.log(text.slice(0, 1500));
  console.log("--- tail ---");
  console.log(text.slice(-800));
} catch (e) {
  console.log("error", e instanceof Error ? e.message : e);
} finally {
  clearTimeout(t);
}
