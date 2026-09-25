import { NextResponse, type NextRequest } from "next/server";
import { resolveLectureFile } from "@/lib/lecture-file-access";
import { getCurrentUser } from "@/lib/session";
import { isStorageConfigured, presignDownload, presignInline } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * An audio or PDF lesson's file: a redirect to a five-minute signed S3 GET,
 * shown in place (audio player, PDF viewer), or saved with ?download=1. The
 * same 404 for "missing" and "not yours".
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const user = await getCurrentUser();
  const file = await resolveLectureFile(user?.id ?? null, itemId);
  if (!file) return new NextResponse("Not found", { status: 404 });
  if (!isStorageConfigured()) return new NextResponse("File storage is not available", { status: 503 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const url = download
    ? await presignDownload(file.key, file.filename)
    : await presignInline(file.key, file.filename, file.kind === "FILE" ? "application/pdf" : undefined);
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
