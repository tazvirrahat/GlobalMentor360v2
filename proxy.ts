import { NextResponse, type NextRequest } from "next/server";
import { VIEW_AS_COOKIE, viewAsExpiry } from "@/lib/view-as-cookie";

/**
 * Read-only while an admin is viewing the site as someone (features plan 16).
 * Every request that could change something (anything but GET, HEAD and
 * OPTIONS: server actions are POSTs) is refused while an unexpired view-as
 * cookie is present, so no page, action or route has to remember to check.
 * Stopping and signing out stay open.
 *
 * The expiry is read without the signature: a forged cookie can only make its
 * own holder read-only. Who is being viewed is decided in lib/session, which
 * does verify it.
 */

const OPEN = new Set(["/api/impersonation/stop", "/api/auth/sign-out"]);

export function proxy(request: NextRequest) {
  const grant = request.cookies.get(VIEW_AS_COOKIE)?.value;
  if (!grant) return NextResponse.next();
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return NextResponse.next();
  if (OPEN.has(request.nextUrl.pathname)) return NextResponse.next();
  const expiry = viewAsExpiry(grant);
  if (expiry === null || expiry <= Date.now()) return NextResponse.next();
  return new NextResponse("You're viewing the site as someone else, which is read-only. Stop viewing to make changes.", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = {
  // Everything but build assets and images; the check above is cheap.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
