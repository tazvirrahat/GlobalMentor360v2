import type { VideoAssetStatus, WebhookEvent } from "./provider";

/**
 * EventBridge "MediaConvert Job State Change" payload, as delivered to
 * POST /api/video/webhook or as an SQS message body. Everything is optional
 * because we null-check each field before applying it.
 */
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
  detail?: MediaConvertEventDetail | string;
}

const STATUS_BY_JOB_STATE: Record<string, VideoAssetStatus> = {
  SUBMITTED: "PROCESSING",
  PROGRESSING: "PROCESSING",
  STATUS_UPDATE: "PROCESSING",
  INPUT_INFORMATION: "PROCESSING",
  COMPLETE: "READY",
  ERROR: "FAILED",
  CANCELED: "FAILED",
};

function mapJobState(jobState: string): VideoAssetStatus {
  const known = STATUS_BY_JOB_STATE[jobState];
  if (known) return known;
  // Unknown terminal-ish names must not sit in PROCESSING forever. Anything
  // else stays PROCESSING so a new in-progress EventBridge detail cannot
  // flip a row to FAILED.
  if (/CANCEL|ERROR|FAIL|ABORT/i.test(jobState)) return "FAILED";
  return "PROCESSING";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readDurationMs(detail: Record<string, unknown>): number | undefined {
  const groups = detail.outputGroupDetails;
  if (!Array.isArray(groups) || groups.length === 0) return undefined;
  const first = asRecord(groups[0]);
  const outputs = first?.outputDetails;
  if (!Array.isArray(outputs) || outputs.length === 0) return undefined;
  const output = asRecord(outputs[0]);
  return typeof output?.durationInMs === "number" ? output.durationInMs : undefined;
}

/**
 * Map a MediaConvert job-state payload to the same WebhookEvent the HTTP
 * webhook applies. Accepts a parsed object or the raw JSON string SQS stores.
 */
export function mapMediaConvertJobEvent(payload: unknown): WebhookEvent | null {
  const event = typeof payload === "string" ? parseJson(payload) : payload;
  const root = asRecord(event) as MediaConvertEvent | null;
  if (!root) return null;

  const rawDetail =
    typeof root.detail === "string" ? parseJson(root.detail) : root.detail;
  const detail = asRecord(rawDetail);
  if (!detail) return null;

  const metadata = asRecord(detail.userMetadata);
  const assetId = typeof metadata?.assetId === "string" ? metadata.assetId : "";
  const jobState = typeof detail.status === "string" ? detail.status : "";
  if (!assetId || !jobState) return null;

  const status = mapJobState(jobState);
  const durationInMs = readDurationMs(detail);
  const errorMessage = typeof detail.errorMessage === "string" ? detail.errorMessage : null;

  return {
    providerAssetId: assetId,
    status,
    failureReason:
      status === "FAILED" ? (errorMessage ?? `MediaConvert job state ${jobState}`) : null,
    durationSeconds:
      status === "READY" && typeof durationInMs === "number" && durationInMs > 0
        ? Math.round(durationInMs / 1000)
        : null,
  };
}
