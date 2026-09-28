import { NextResponse } from "next/server";
import { lecturePlayback } from "@/lib/playback";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A signed HLS URL for a lecture's video, for whoever may open the lecture. */
export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const user = await getCurrentUser();
  const playback = await lecturePlayback(user?.id ?? null, itemId);
  return NextResponse.json(playback, { headers: { "cache-control": "private, no-store" } });
}
