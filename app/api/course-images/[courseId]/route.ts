import { NextResponse } from "next/server";
import { resolveCourseImage } from "@/lib/course-image-access";
import { getCurrentUser } from "@/lib/session";
import { isStorageConfigured, presignView } from "@/lib/storage";

export const dynamic = "force-dynamic";

// A published image's redirect is cached for five minutes, so the signed URL it
// points at has to outlive that cache.
const PUBLIC_MAX_AGE = 300;
const SIGNED_TTL = 900;

/**
 * A course's image: a redirect to a signed S3 GET (the bucket is private).
 * Published courses are public and cacheable; a draft's image only for its
 * instructor and admins. The same 404 for "no image" and "not yours".
 */
export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!isStorageConfigured()) return new NextResponse("Not found", { status: 404 });

  const user = await getCurrentUser();
  const image = await resolveCourseImage(user?.id ?? null, courseId);
  if (!image) return new NextResponse("Not found", { status: 404 });

  const response = NextResponse.redirect(await presignView(image.key, SIGNED_TTL), 302);
  response.headers.set("Cache-Control", image.isPublic ? `public, max-age=${PUBLIC_MAX_AGE}` : "private, no-store");
  return response;
}
