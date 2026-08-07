import { createHash } from "node:crypto";
import {
  VideoProviderError,
  type CreateUploadResult,
  type SignedPlayback,
  type VideoAsset,
  type VideoAssetStatus,
  type VideoProvider,
  type WebhookEvent,
} from "./provider";

const API_BASE = "https://video.bunnycdn.com/library";

/** Bunny's numeric status codes, from their Stream API docs. */
const STATUS_BY_CODE: Record<number, VideoAssetStatus> = {
  0: "UPLOADING", // Created
  1: "UPLOADING", // Uploaded
  2: "PROCESSING", // Processing
  3: "PROCESSING", // Transcoding
  4: "READY", // Finished
  5: "FAILED", // Error
  6: "FAILED", // UploadFailed
};

interface BunnyVideo {
  guid: string;
  status: number;
  length?: number;
  thumbnailFileName?: string;
}

interface BunnyConfig {
  libraryId: string;
  apiKey: string;
  cdnHostname: string;
  tokenAuthKey: string;
}

function readConfig(): BunnyConfig {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
  const tokenAuthKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;

  // Read lazily rather than at import time — the app must boot without video
  // credentials so unrelated work isn't blocked on having a Bunny account.
  if (!libraryId || !apiKey || !cdnHostname || !tokenAuthKey) {
    throw new VideoProviderError(
      "Bunny Stream is not configured. Set BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY, " +
        "BUNNY_STREAM_CDN_HOSTNAME and BUNNY_STREAM_TOKEN_AUTH_KEY.",
    );
  }

  return { libraryId, apiKey, cdnHostname, tokenAuthKey };
}

function toAsset(video: BunnyVideo, cdnHostname: string): VideoAsset {
  const status = STATUS_BY_CODE[video.status] ?? "PROCESSING";
  return {
    providerAssetId: video.guid,
    status,
    durationSeconds: video.length && video.length > 0 ? video.length : null,
    thumbnailUrl: video.thumbnailFileName
      ? `https://${cdnHostname}/${video.guid}/${video.thumbnailFileName}`
      : null,
    failureReason: status === "FAILED" ? `Bunny status code ${video.status}` : null,
  };
}

async function bunnyFetch(
  config: BunnyConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${API_BASE}/${config.libraryId}${path}`, {
    ...init,
    headers: {
      AccessKey: config.apiKey,
      accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    throw new VideoProviderError(
      `Bunny Stream request failed: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  return response;
}

export const bunnyProvider: VideoProvider = {
  name: "bunny",

  async createUpload({ title }): Promise<CreateUploadResult> {
    const config = readConfig();

    const response = await bunnyFetch(config, "/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });

    const video = (await response.json()) as BunnyVideo;

    return {
      providerAssetId: video.guid,
      uploadUrl: `${API_BASE}/${config.libraryId}/videos/${video.guid}`,
      // The API key must not reach the browser. The upload route proxies or issues
      // a short-lived signature; this shape keeps that decision out of callers.
      uploadHeaders: { "content-type": "application/octet-stream" },
      // Bunny stores the original itself; there is no key in our storage.
      originalKey: null,
    };
  },

  async startProcessing(): Promise<void> {
    // Bunny transcodes automatically once the upload finishes — nothing to start.
  },

  async getAsset(providerAssetId): Promise<VideoAsset> {
    const config = readConfig();
    const response = await bunnyFetch(config, `/videos/${providerAssetId}`);
    return toAsset((await response.json()) as BunnyVideo, config.cdnHostname);
  },

  signPlaybackUrl(providerAssetId, ttlSeconds = 60 * 60 * 4): SignedPlayback {
    const config = readConfig();
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;

    // Bunny token auth: sha256(securityKey + videoId + expiry), hex.
    const token = createHash("sha256")
      .update(`${config.tokenAuthKey}${providerAssetId}${expires}`)
      .digest("hex");

    return {
      hlsUrl:
        `https://${config.cdnHostname}/${providerAssetId}/playlist.m3u8` +
        `?token=${token}&expires=${expires}`,
      expiresAt: new Date(expires * 1000),
    };
  },

  async deleteAsset(providerAssetId): Promise<void> {
    const config = readConfig();
    await bunnyFetch(config, `/videos/${providerAssetId}`, { method: "DELETE" });
  },

  verifyWebhook(rawBody, headers): WebhookEvent | null {
    const config = readConfig();

    // Bunny signs webhooks with sha256(securityKey + body). Compare case-insensitively;
    // header casing varies by runtime.
    const signature = headers["x-bunny-signature"] ?? headers["X-Bunny-Signature"];
    if (!signature) return null;

    const expected = createHash("sha256")
      .update(`${config.tokenAuthKey}${rawBody}`)
      .digest("hex");

    if (signature.toLowerCase() !== expected.toLowerCase()) return null;

    let payload: { VideoGuid?: string; Status?: number };
    try {
      payload = JSON.parse(rawBody) as { VideoGuid?: string; Status?: number };
    } catch {
      return null;
    }

    if (!payload.VideoGuid || payload.Status === undefined) return null;

    const status = STATUS_BY_CODE[payload.Status] ?? "PROCESSING";
    return {
      providerAssetId: payload.VideoGuid,
      status,
      failureReason: status === "FAILED" ? `Bunny status code ${payload.Status}` : null,
      // Bunny webhooks don't carry duration; getAsset reconciles it later.
      durationSeconds: null,
    };
  },
};
