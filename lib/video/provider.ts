/**
 * The seam that keeps the video vendor swappable.
 *
 * Nothing outside lib/video should import a vendor SDK or hardcode a vendor URL.
 * The studio, the player, and the webhook handler all talk to this interface, so
 * moving from Bunny Stream to Mux is one new implementation rather than a change
 * spread across the app. See docs/TECH-SPEC.md#why-bunny-stream.
 */

/** Mirrors MediaStatus in the Prisma schema. */
export type VideoAssetStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";

export interface VideoAsset {
  /** The vendor's id, stored as MediaAsset.providerAssetId. */
  providerAssetId: string;
  status: VideoAssetStatus;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  /** Vendor-supplied reason when status is FAILED. */
  failureReason: string | null;
}

export interface CreateUploadResult {
  providerAssetId: string;
  /** Where the browser PUTs the file bytes. */
  uploadUrl: string;
  /** Headers the browser must send with the upload. Never includes long-lived secrets. */
  uploadHeaders: Record<string, string>;
}

export interface SignedPlayback {
  /** HLS manifest URL, already signed if the provider supports it. */
  hlsUrl: string;
  expiresAt: Date;
}

export interface WebhookEvent {
  providerAssetId: string;
  status: VideoAssetStatus;
  failureReason: string | null;
}

export interface VideoProvider {
  readonly name: string;

  /** Reserve an asset and return a direct-upload target. */
  createUpload(input: { title: string }): Promise<CreateUploadResult>;

  /** Current vendor-side state. Used to reconcile when a webhook is missed. */
  getAsset(providerAssetId: string): Promise<VideoAsset>;

  /**
   * Signed, expiring playback URL. Callers must have already checked entitlement —
   * this signs, it does not authorize.
   */
  signPlaybackUrl(providerAssetId: string, ttlSeconds?: number): SignedPlayback;

  deleteAsset(providerAssetId: string): Promise<void>;

  /**
   * Verify and parse a provider webhook. Returns null when the signature does not
   * verify, so the caller can 401 without needing vendor-specific knowledge.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookEvent | null;
}

export class VideoProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VideoProviderError";
  }
}
