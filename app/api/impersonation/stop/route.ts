import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { stopViewAs } from "@/lib/impersonation";
import { getSession } from "@/lib/session";
import { VIEW_AS_COOKIE, VIEW_AS_LABEL_COOKIE } from "@/lib/view-as-cookie";

/**
 * Ends a "view as": audits the stop (under the real, signed-in admin), clears
 * both cookies, and goes back to the person's admin page. proxy.ts leaves this
 * one POST open so there is always a way out.
 */
export async function POST(request: Request) {
  const session = await getSession();
  const raw = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  const targetId = session?.user ? await stopViewAs(session.user.id, raw) : null;
  const response = NextResponse.redirect(new URL(targetId ? `/admin/users/${targetId}` : "/", request.url), 303);
  response.cookies.delete(VIEW_AS_COOKIE);
  response.cookies.delete(VIEW_AS_LABEL_COOKIE);
  return response;
}
