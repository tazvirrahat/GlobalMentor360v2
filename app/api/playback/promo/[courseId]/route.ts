import { NextResponse } from "next/server";
import { promoPlayback } from "@/lib/playback";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A signed HLS URL for a course's promo video (see lib/promo for who may watch). */
export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  const playback = await promoPlayback(user?.id ?? null, courseId);
  return NextResponse.json(playback, { headers: { "cache-control": "private, no-store" } });
}
