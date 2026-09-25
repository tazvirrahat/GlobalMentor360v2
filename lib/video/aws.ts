import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presignS3Request } from "@aws-sdk/s3-request-presigner";
import { CreateJobCommand, MediaConvertClient, type Output } from "@aws-sdk/client-mediaconvert";
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { getSignedUrl as signCloudFrontUrl } from "@aws-sdk/cloudfront-signer";
import { applyMediaConvertJobEvent } from "./apply-job-event";
import { mapMediaConvertJobEvent } from "./mediaconvert-event";
import {
  VideoProviderError,
  type CreateUploadResult,
  type SignedPlayback,
  type VideoAsset,
  type VideoAssetStatus,
  type VideoProvider,
  type WebhookEvent,
} from "./provider";

/**
 * AWS pipeline: browser PUTs the original to S3 via a presigned URL, a
 * MediaConvert job transcodes it to HLS in the same bucket, CloudFront serves
 * the renditions with signed URLs. Job state changes are parked on SQS by
 * EventBridge (local-dev drain) and, when a public origin exists, can also
 * POST to /api/video/webhook.
 *
 * Key layout (the assetId is a uuid we mint — it IS the providerAssetId):
 *   uploads/{assetId}/original      raw upload
 *   hls/{assetId}/index.m3u8        master manifest (MediaConvert destination
 *                                   ends in /index, so the master is index.m3u8)
 *   hls/{assetId}/index_720p.m3u8…  variant playlists + segments
 */

const UPLOAD_URL_TTL_SECONDS = 60 * 60;
const PLAYBACK_TTL_SECONDS = 60 * 60 * 4;
const WEBHOOK_SECRET_HEADER = "x-webhook-secret";
const SQS_DRAIN_MAX_BATCHES = 3;
const SQS_DRAIN_MAX_MESSAGES = 10;

function originalKey(assetId: string): string {
  return `uploads/${assetId}/original`;
}

function hlsPrefix(assetId: string): string {
  return `hls/${assetId}/`;
}

function masterManifestKey(assetId: string): string {
  return `${hlsPrefix(assetId)}index.m3u8`;
}

// ---------------------------------------------------------------------------
// Config — read lazily so the app boots without AWS credentials, mirroring the
// Bunny implementation. Each surface (S3, MediaConvert, CloudFront, webhook)
// has its own guard so the error names exactly the vars that are missing.
// ---------------------------------------------------------------------------

interface AwsBaseConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function missing(...vars: string[]): VideoProviderError {
  return new VideoProviderError(
    `AWS video is not configured. Set ${vars.join(", ")} in .env (see .env.example).`,
  );
}

function readBaseConfig(): AwsBaseConfig {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw missing("AWS_REGION", "AWS_S3_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY");
  }

  return { region, bucket, accessKeyId, secretAccessKey };
}

function readMediaConvertConfig(): AwsBaseConfig & { endpoint: string; roleArn: string } {
  const base = readBaseConfig();
  const endpoint = process.env.AWS_MEDIACONVERT_ENDPOINT;
  const roleArn = process.env.AWS_MEDIACONVERT_ROLE_ARN;

  if (!endpoint || !roleArn) {
    throw missing("AWS_MEDIACONVERT_ENDPOINT", "AWS_MEDIACONVERT_ROLE_ARN");
  }

  return { ...base, endpoint, roleArn };
}

function readCloudFrontConfig(): { domain: string; keyPairId: string; privateKey: string } {
  const domain = process.env.AWS_CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.AWS_CLOUDFRONT_KEY_PAIR_ID;
  const privateKey = process.env.AWS_CLOUDFRONT_PRIVATE_KEY;

  if (!domain || !keyPairId || !privateKey) {
    throw missing("AWS_CLOUDFRONT_DOMAIN", "AWS_CLOUDFRONT_KEY_PAIR_ID", "AWS_CLOUDFRONT_PRIVATE_KEY");
  }

  // .env files usually store the PEM on one line with literal \n sequences.
  return { domain, keyPairId, privateKey: privateKey.replace(/\\n/g, "\n") };
}

// Env vars don't change at runtime, so one client per process is enough.
let s3Singleton: S3Client | null = null;
let mediaConvertSingleton: MediaConvertClient | null = null;
let sqsSingleton: SQSClient | null = null;

function s3(config: AwsBaseConfig): S3Client {
  s3Singleton ??= new S3Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return s3Singleton;
}

function mediaConvert(config: ReturnType<typeof readMediaConvertConfig>): MediaConvertClient {
  mediaConvertSingleton ??= new MediaConvertClient({
    region: config.region,
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return mediaConvertSingleton;
}

function sqs(config: AwsBaseConfig): SQSClient {
  sqsSingleton ??= new SQSClient({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return sqsSingleton;
}

/**
 * The app's S3 bucket and client, for other stored files that live beside the
 * video originals (lecture resources). Throws the same "not configured" error
 * as the video pipeline when the AWS variables are unset.
 */
export function appBucket(): { client: S3Client; bucket: string } {
  const config = readBaseConfig();
  return { client: s3(config), bucket: config.bucket };
}

/** True when the S3 variables are set, without throwing. */
export function isAppBucketConfigured(): boolean {
  return Boolean(
    process.env.AWS_REGION && process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
  );
}

// ---------------------------------------------------------------------------
// S3 helpers
// ---------------------------------------------------------------------------

async function objectExists(config: AwsBaseConfig, key: string): Promise<boolean> {
  try {
    await s3(config).send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return true;
  } catch (error) {
    if (error instanceof NotFound) return false;
    throw new VideoProviderError(
      `S3 HeadObject failed for ${key}: ${error instanceof Error ? error.message : String(error)}. ` +
        "A 403 here usually means the IAM user lacks s3:ListBucket on the bucket.",
    );
  }
}

async function readObjectText(config: AwsBaseConfig, key: string): Promise<string | null> {
  try {
    const response = await s3(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return (await response.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Best-effort duration: sum the #EXTINF segment durations of the first variant
 * playlist. Avoids a MediaConvert GetJob (we don't store job ids) and works
 * even when the READY state was discovered by reconciliation, not the webhook.
 */
async function readDurationFromManifests(
  config: AwsBaseConfig,
  assetId: string,
): Promise<number | null> {
  const master = await readObjectText(config, masterManifestKey(assetId));
  if (!master) return null;

  const variantName = master
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));
  if (!variantName) return null;

  const variant = await readObjectText(config, `${hlsPrefix(assetId)}${variantName}`);
  if (!variant) return null;

  let total = 0;
  for (const line of variant.split("\n")) {
    const match = /^#EXTINF:([\d.]+)/.exec(line.trim());
    if (match?.[1]) total += Number.parseFloat(match[1]);
  }

  return total > 0 ? Math.round(total) : null;
}

async function deletePrefix(config: AwsBaseConfig, prefix: string): Promise<void> {
  let continuationToken: string | undefined;

  do {
    const listed = await s3(config).send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const keys = (listed.Contents ?? [])
      .map((object) => object.Key)
      .filter((key): key is string => Boolean(key));

    if (keys.length > 0) {
      await s3(config).send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: true },
        }),
      );
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

// ---------------------------------------------------------------------------
// MediaConvert job
// ---------------------------------------------------------------------------

function hlsRendition(nameModifier: string, height: number, maxBitrate: number): Output {
  return {
    NameModifier: nameModifier,
    ContainerSettings: { Container: "M3U8", M3u8Settings: {} },
    VideoDescription: {
      // Width omitted so MediaConvert preserves the source aspect ratio.
      Height: height,
      CodecSettings: {
        Codec: "H_264",
        H264Settings: {
          RateControlMode: "QVBR",
          MaxBitrate: maxBitrate,
          SceneChangeDetect: "TRANSITION_DETECTION",
        },
      },
    },
    AudioDescriptions: [
      {
        AudioSourceName: "Audio Selector 1",
        CodecSettings: {
          Codec: "AAC",
          AacSettings: { Bitrate: 96000, CodingMode: "CODING_MODE_2_0", SampleRate: 48000 },
        },
      },
    ],
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  // Hash both sides so timingSafeEqual gets equal-length buffers regardless of input.
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const awsProvider: VideoProvider = {
  name: "aws",

  async createUpload({ contentType }): Promise<CreateUploadResult> {
    const config = readBaseConfig();
    const providerAssetId = randomUUID();
    const key = originalKey(providerAssetId);

    // The presigned PUT binds the signature to this exact content type, so the
    // browser must echo it back. A presigned URL cannot express "video/*".
    const type = contentType?.startsWith("video/") ? contentType : "video/mp4";

    // NOTE: the bucket needs a CORS rule allowing PUT from the app origin, or
    // the browser upload dies in preflight.
    const uploadUrl = await presignS3Request(
      s3(config),
      new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: type }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return {
      providerAssetId,
      uploadUrl,
      uploadHeaders: { "content-type": type },
      originalKey: key,
    };
  },

  async startProcessing(providerAssetId): Promise<void> {
    const config = readMediaConvertConfig();

    if (!(await objectExists(config, originalKey(providerAssetId)))) {
      throw new VideoProviderError("upload not found — did the file finish uploading?");
    }

    try {
      await mediaConvert(config).send(
        new CreateJobCommand({
          Role: config.roleArn,
          // The webhook and reconciliation both key off this — it round-trips
          // through the EventBridge job state-change event.
          UserMetadata: { assetId: providerAssetId },
          Settings: {
            TimecodeConfig: { Source: "ZEROBASED" },
            Inputs: [
              {
                FileInput: `s3://${config.bucket}/${originalKey(providerAssetId)}`,
                AudioSelectors: { "Audio Selector 1": { DefaultSelection: "DEFAULT" } },
                VideoSelector: {},
                TimecodeSource: "ZEROBASED",
              },
            ],
            OutputGroups: [
              {
                Name: "HLS",
                OutputGroupSettings: {
                  Type: "HLS_GROUP_SETTINGS",
                  HlsGroupSettings: {
                    // Destination base name "index" makes the master manifest
                    // hls/{assetId}/index.m3u8 — keep in sync with masterManifestKey.
                    Destination: `s3://${config.bucket}/${hlsPrefix(providerAssetId)}index`,
                    SegmentLength: 6,
                    MinSegmentLength: 0,
                  },
                },
                Outputs: [
                  hlsRendition("_720p", 720, 3_500_000),
                  hlsRendition("_480p", 480, 1_400_000),
                ],
              },
            ],
          },
        }),
      );
    } catch (error) {
      if (error instanceof VideoProviderError) throw error;
      throw new VideoProviderError(
        `MediaConvert job creation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },

  async getAsset(providerAssetId): Promise<VideoAsset> {
    const config = readBaseConfig();

    // Reconcile from S3 alone — no job id needed. The one state S3 cannot
    // reveal is FAILED (no manifest ever appears); that arrives via webhook.
    if (await objectExists(config, masterManifestKey(providerAssetId))) {
      return {
        providerAssetId,
        status: "READY",
        durationSeconds: await readDurationFromManifests(config, providerAssetId),
        thumbnailUrl: null,
        failureReason: null,
      };
    }

    const status: VideoAssetStatus = (await objectExists(config, originalKey(providerAssetId)))
      ? "PROCESSING"
      : "UPLOADING";

    return { providerAssetId, status, durationSeconds: null, thumbnailUrl: null, failureReason: null };
  },

  /**
   * Signing approach: one signed URL for the master manifest with a CUSTOM
   * policy whose Resource is a wildcard over hls/{assetId}/*. The resulting
   * Policy/Signature/Key-Pair-Id query params are therefore valid for every
   * variant playlist and segment under the asset — the player's hls.js loader
   * just appends the same query string to child requests.
   *
   * Tradeoff vs signed cookies: no extra route or cookie-domain coupling, and
   * it works cross-origin; the cost is that the player must propagate the
   * query params (plain hls.js won't without a loader) and the URLs are long.
   * CloudFront prerequisites: the cache behavior for /hls/* must restrict
   * viewer access to the trusted key group holding AWS_CLOUDFRONT_KEY_PAIR_ID,
   * and must forward/allow query strings so the auth params reach CloudFront
   * on every request.
   */
  signPlaybackUrl(providerAssetId, ttlSeconds = PLAYBACK_TTL_SECONDS): SignedPlayback {
    const config = readCloudFrontConfig();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const policy = JSON.stringify({
      Statement: [
        {
          Resource: `https://${config.domain}/${hlsPrefix(providerAssetId)}*`,
          Condition: {
            DateLessThan: { "AWS:EpochTime": Math.floor(expiresAt.getTime() / 1000) },
          },
        },
      ],
    });

    const hlsUrl = signCloudFrontUrl({
      url: `https://${config.domain}/${masterManifestKey(providerAssetId)}`,
      keyPairId: config.keyPairId,
      privateKey: config.privateKey,
      policy,
    });

    return { hlsUrl, expiresAt };
  },

  async deleteAsset(providerAssetId): Promise<void> {
    const config = readBaseConfig();
    await deletePrefix(config, `uploads/${providerAssetId}/`);
    await deletePrefix(config, hlsPrefix(providerAssetId));
    await deletePrefix(config, `captions/${providerAssetId}/`);
  },

  verifyWebhook(rawBody, headers): WebhookEvent | null {
    const secret = process.env.AWS_VIDEO_WEBHOOK_SECRET;
    if (!secret) throw missing("AWS_VIDEO_WEBHOOK_SECRET");

    const provided = headers[WEBHOOK_SECRET_HEADER] ?? headers["X-Webhook-Secret"];
    if (!provided || !constantTimeEquals(provided, secret)) return null;

    return mapMediaConvertJobEvent(rawBody);
  },
};

// ---------------------------------------------------------------------------
// Resumable (multipart) uploads of an original. The key is always
// uploads/{assetId}/original, derived here from the asset id, never taken
// from the browser.
// ---------------------------------------------------------------------------

function s3Failure(action: string, error: unknown): VideoProviderError {
  if (error instanceof VideoProviderError) return error;
  return new VideoProviderError(`S3 ${action} failed: ${error instanceof Error ? error.message : String(error)}`);
}

/** Reserves an asset id and opens a multipart upload for its original. */
export async function createResumableUpload(contentType: string | undefined): Promise<{
  providerAssetId: string;
  originalKey: string;
  uploadId: string;
}> {
  const config = readBaseConfig();
  const providerAssetId = randomUUID();
  const key = originalKey(providerAssetId);
  const type = contentType?.startsWith("video/") ? contentType : "video/mp4";
  try {
    const created = await s3(config).send(new CreateMultipartUploadCommand({ Bucket: config.bucket, Key: key, ContentType: type }));
    if (!created.UploadId) throw new VideoProviderError("S3 did not return an upload id.");
    return { providerAssetId, originalKey: key, uploadId: created.UploadId };
  } catch (error) {
    throw s3Failure("CreateMultipartUpload", error);
  }
}

/** Presigned PUT URLs for some parts. The bucket's CORS rule must allow PUT from the app origin. */
export async function signUploadParts(key: string, uploadId: string, partNumbers: number[]): Promise<Record<number, string>> {
  const config = readBaseConfig();
  const client = s3(config);
  const urls: Record<number, string> = {};
  for (const partNumber of partNumbers) {
    urls[partNumber] = await presignS3Request(
      client,
      new UploadPartCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
  }
  return urls;
}

/** The parts S3 already holds, read on the server so the browser never has to see ETags. */
export async function listUploadedParts(key: string, uploadId: string): Promise<{ partNumber: number; etag: string; size: number }[]> {
  const config = readBaseConfig();
  const client = s3(config);
  const parts: { partNumber: number; etag: string; size: number }[] = [];
  let marker: string | undefined;
  try {
    for (;;) {
      const page = await client.send(
        new ListPartsCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }),
      );
      for (const part of page.Parts ?? []) {
        if (part.PartNumber && part.ETag) parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size ?? 0 });
      }
      if (!page.IsTruncated || !page.NextPartNumberMarker) break;
      marker = page.NextPartNumberMarker;
    }
  } catch (error) {
    throw s3Failure("ListParts", error);
  }
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

export async function completeResumableUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const config = readBaseConfig();
  try {
    await s3(config).send(
      new CompleteMultipartUploadCommand({
        Bucket: config.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) },
      }),
    );
  } catch (error) {
    throw s3Failure("CompleteMultipartUpload", error);
  }
}

/** Best effort: an abandoned multipart upload only costs storage until a lifecycle rule clears it. */
export async function abortResumableUpload(key: string, uploadId: string): Promise<void> {
  try {
    const config = readBaseConfig();
    await s3(config).send(new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId }));
  } catch (error) {
    console.error("video: could not abort a multipart upload", error);
  }
}

/**
 * Short-poll the MediaConvert job-state queue and apply COMPLETE/ERROR the
 * same way /api/video/webhook does. Local-dev path: AWS cannot POST to
 * localhost, so studio refresh (and curriculum listing) drain instead.
 * Never long-polls — at most SQS_DRAIN_MAX_BATCHES receives of 10.
 */
export async function drainMediaConvertEventQueue(): Promise<number> {
  const queueUrl = process.env.AWS_VIDEO_EVENT_QUEUE_URL?.trim();
  if (!queueUrl) return 0;
  try {
    const applied = await drainQueue(queueUrl);
    drainStore.__videoLastDrain = { at: new Date(), applied, error: null };
    return applied;
  } catch (error) {
    drainStore.__videoLastDrain = { at: new Date(), applied: 0, error: error instanceof Error ? error.message : String(error) };
    throw error;
  }
}

export type DrainRecord = { at: Date; applied: number; error: string | null };

// On globalThis so dev reloads and separate route bundles see the same record.
// Per server process: another instance has its own (Admin › Videos says so).
const drainStore = globalThis as unknown as { __videoLastDrain?: DrainRecord };

/** The last drain this server process ran, for Admin › Videos. */
export function lastDrain(): DrainRecord | null {
  return drainStore.__videoLastDrain ?? null;
}

export function isVideoEventQueueConfigured(): boolean {
  return Boolean(process.env.AWS_VIDEO_EVENT_QUEUE_URL?.trim());
}

async function drainQueue(queueUrl: string): Promise<number> {
  const config = readBaseConfig();
  const client = sqs(config);
  let applied = 0;

  for (let batch = 0; batch < SQS_DRAIN_MAX_BATCHES; batch++) {
    let received;
    try {
      received = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: SQS_DRAIN_MAX_MESSAGES,
          WaitTimeSeconds: 0,
          VisibilityTimeout: 30,
        }),
      );
    } catch (error) {
      throw new VideoProviderError(
        `SQS ReceiveMessage failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const messages = received.Messages ?? [];
    if (messages.length === 0) break;

    for (const message of messages) {
      const event = mapMediaConvertJobEvent(message.Body ?? null);
      let appliedThis = false;

      if (event) {
        try {
          await applyMediaConvertJobEvent(event);
          appliedThis = true;
          applied += 1;
        } catch {
          // Leave invisible until VisibilityTimeout so a later drain retries.
          continue;
        }
      }

      if (message.ReceiptHandle && (appliedThis || !event)) {
        try {
          await client.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
        } catch (error) {
          throw new VideoProviderError(
            `SQS DeleteMessage failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    if (messages.length < SQS_DRAIN_MAX_MESSAGES) break;
  }

  return applied;
}

/** Best-effort drain for page loads — never fails the studio render. */
export async function tryDrainMediaConvertEventQueue(): Promise<void> {
  try {
    await drainMediaConvertEventQueue();
  } catch {
    // Queue URL / IAM may be unset in some environments; S3 refresh still works.
  }
}

/** Whether the HLS master manifest is already in S3. Used to promote FAILED → READY. */
export async function hlsMasterManifestExists(providerAssetId: string): Promise<boolean> {
  const config = readBaseConfig();
  return objectExists(config, masterManifestKey(providerAssetId));
}

export function captionObjectKey(providerAssetId: string, language: string): string {
  return `captions/${providerAssetId}/${language}.vtt`;
}

/**
 * Uploaded VTT files live next to the HLS prefix, not inside it, so a dormant
 * CloudFront signing policy on /hls/* cannot lock learners out of captions.
 * The player fetches them through the app (entitlement checked there).
 */
export async function putCaptionObject(
  providerAssetId: string,
  language: string,
  body: string,
): Promise<string> {
  const config = readBaseConfig();
  const key = captionObjectKey(providerAssetId, language);
  await s3(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: "text/vtt; charset=utf-8",
    }),
  );
  return key;
}

export async function readCaptionObject(key: string): Promise<string | null> {
  const config = readBaseConfig();
  return readObjectText(config, key);
}
