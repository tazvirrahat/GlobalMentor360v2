import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, NotFound, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { appBucket, isAppBucketConfigured } from "@/lib/video/aws";

/**
 * Files in the app's S3 bucket beside the video originals: lecture resources
 * and course images. Uploads are a presigned PUT from the browser (like
 * video); reads a short-lived presigned GET. Nothing here decides who may
 * read or write: the caller does that first.
 */

const UPLOAD_TTL_SECONDS = 15 * 60;
const DOWNLOAD_TTL_SECONDS = 5 * 60;

export function isStorageConfigured(): boolean {
  return isAppBucketConfigured();
}

export async function presignUpload(
  key: string,
  contentType: string,
): Promise<{ url: string; headers: Record<string, string> }> {
  const { client, bucket } = appBucket();
  const type = contentType || "application/octet-stream";
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: type }), {
    expiresIn: UPLOAD_TTL_SECONDS,
  });
  return { url, headers: { "content-type": type } };
}

/** The stored object's size and type, or null when it is not there (the upload never finished). */
export async function headObject(key: string): Promise<{ size: number; contentType: string | null } | null> {
  const { client, bucket } = appBucket();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
  } catch (error) {
    if (error instanceof NotFound) return null;
    throw error;
  }
}

/** A download that asks the browser to save the file under its own name. */
export async function presignDownload(key: string, filename: string): Promise<string> {
  const { client, bucket } = appBucket();
  // RFC 6266: a plain ASCII fallback plus the UTF-8 name.
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const disposition = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: DOWNLOAD_TTL_SECONDS },
  );
}

/** A plain GET for something the page shows (an image), not a download. */
export async function presignView(key: string, expiresIn = DOWNLOAD_TTL_SECONDS): Promise<string> {
  const { client, bucket } = appBucket();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

/** Best effort: a row deleted with its file left behind costs storage, not correctness. */
export async function deleteObject(key: string): Promise<void> {
  if (!isStorageConfigured() || !key) return;
  try {
    const { client, bucket } = appBucket();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.error("storage: could not delete object", error);
  }
}
