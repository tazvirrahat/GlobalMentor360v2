import { NextResponse } from "next/server";
import { resolveResourceDownload } from "@/lib/resource-access";
import { getCurrentUser } from "@/lib/session";
import { isStorageConfigured, presignResourceDownload } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * A lecture resource: redirects to a presigned S3 GET (five minutes, saved
 * under the file's own name) for a file, or to the address for a link. The
 * same 404 for "missing" and "not yours", so nothing leaks either way.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const user = await getCurrentUser();
  const target = await resolveResourceDownload(user?.id ?? null, resourceId);
  if (!target) return new NextResponse("Not found", { status: 404 });

  if (target.kind === "link") return NextResponse.redirect(target.url, 302);
  if (!isStorageConfigured()) return new NextResponse("File storage is not available", { status: 503 });

  const url = await presignResourceDownload(target.key, target.filename);
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
