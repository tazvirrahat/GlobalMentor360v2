import { NextResponse } from "next/server";
import { getCaptionForPlayback } from "@/lib/captions";
import { canAccessItemMedia } from "@/lib/progress";
import { getCurrentUser } from "@/lib/session";
import { readCaptionObject } from "@/lib/video";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ captionId: string }> },
) {
  const { captionId } = await params;
  const caption = await getCaptionForPlayback(captionId);
  const itemId = caption?.asset.lectures[0]?.curriculumItemId;
  if (!caption || !itemId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await getCurrentUser();
  if (!(await canAccessItemMedia(user?.id ?? null, itemId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const body = await readCaptionObject(caption.vttKey);
  if (!body) {
    return new NextResponse("Caption file missing", { status: 404 });
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}
