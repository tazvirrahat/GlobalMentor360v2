import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presignS3Request } from "@aws-sdk/s3-request-presigner";
import { CreateJobCommand, MediaConvertClient, type Output } from "@aws-sdk/client-mediaconvert";
import { getSignedUrl as signCloudFrontUrl } from "@aws-sdk/cloudfront-signer";
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
 * the renditions with signed URLs. Job state changes arrive as EventBridge
 * events forwarded through an API destination to /api/video/webhook.
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

// ---------------------------------------------------------------------------
// Webhook payload (EventBridge "MediaConvert Job State Change" via an API
// destination). Shape per AWS docs; everything is optional because we only
// trust it after the shared-secret check and null-check each field.
// ---------------------------------------------------------------------------

interface MediaConvertEventDetail {
  status?: string;
  errorMessage?: string;
  userMetadata?: Record<string, string>;
  outputGroupDetails?: {
    outputDetails?: { durationInMs?: number }[];
  }[];
}

interface MediaConvertEvent {
  "detail-type"?: string;
  detail?: MediaConvertEventDetail;
}

const STATUS_BY_JOB_STATE: Record<string, VideoAssetStatus> = {
  SUBMITTED: "PROCESSING",
  PROGRESSING: "PROCESSING",
  STATUS_UPDATE: "PROCESSING",
  INPUT_INFORMATION: "PROCESSING",
  COMPLETE: "READY",
  ERROR: "FAILED",
};

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
  },

  verifyWebhook(rawBody, headers): WebhookEvent | null {
    const secret = process.env.AWS_VIDEO_WEBHOOK_SECRET;
    if (!secret) throw missing("AWS_VIDEO_WEBHOOK_SECRET");

    const provided = headers[WEBHOOK_SECRET_HEADER] ?? headers["X-Webhook-Secret"];
    if (!provided || !constantTimeEquals(provided, secret)) return null;

    let event: MediaConvertEvent;
    try {
      event = JSON.parse(rawBody) as MediaConvertEvent;
    } catch {
      return null;
    }

    const detail = event.detail;
    const assetId = detail?.userMetadata?.assetId;
    const jobState = detail?.status;
    if (!assetId || !jobState) return null;

    const status = STATUS_BY_JOB_STATE[jobState] ?? "PROCESSING";

    const durationInMs = detail?.outputGroupDetails?.[0]?.outputDetails?.[0]?.durationInMs;

    return {
      providerAssetId: assetId,
      status,
      failureReason:
        status === "FAILED" ? (detail?.errorMessage ?? `MediaConvert job state ${jobState}`) : null,
      durationSeconds:
        status === "READY" && typeof durationInMs === "number" && durationInMs > 0
          ? Math.round(durationInMs / 1000)
          : null,
    };
  },
};
