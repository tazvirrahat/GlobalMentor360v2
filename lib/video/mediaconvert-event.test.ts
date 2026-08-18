import { describe, expect, it } from "vitest";
import { mapMediaConvertJobEvent } from "./mediaconvert-event";

const completeEvent = {
  "detail-type": "MediaConvert Job State Change",
  source: "aws.mediaconvert",
  detail: {
    status: "COMPLETE",
    userMetadata: { assetId: "asset-uuid-1" },
    outputGroupDetails: [{ outputDetails: [{ durationInMs: 125_400 }] }],
  },
};

const errorEvent = {
  "detail-type": "MediaConvert Job State Change",
  source: "aws.mediaconvert",
  detail: {
    status: "ERROR",
    errorMessage: "Unable to open input file",
    userMetadata: { assetId: "asset-uuid-2" },
  },
};

describe("mapMediaConvertJobEvent", () => {
  it("maps COMPLETE to READY with rounded duration seconds", () => {
    expect(mapMediaConvertJobEvent(completeEvent)).toEqual({
      providerAssetId: "asset-uuid-1",
      status: "READY",
      failureReason: null,
      durationSeconds: 125,
    });
  });

  it("maps ERROR to FAILED with the vendor error message", () => {
    expect(mapMediaConvertJobEvent(errorEvent)).toEqual({
      providerAssetId: "asset-uuid-2",
      status: "FAILED",
      failureReason: "Unable to open input file",
      durationSeconds: null,
    });
  });

  it("maps in-progress job states to PROCESSING", () => {
    expect(
      mapMediaConvertJobEvent({
        detail: { status: "PROGRESSING", userMetadata: { assetId: "asset-uuid-3" } },
      }),
    ).toEqual({
      providerAssetId: "asset-uuid-3",
      status: "PROCESSING",
      failureReason: null,
      durationSeconds: null,
    });
  });

  it("maps CANCELED to FAILED so a canceled job cannot sit in PROCESSING", () => {
    expect(
      mapMediaConvertJobEvent({
        detail: { status: "CANCELED", userMetadata: { assetId: "asset-uuid-4" } },
      }),
    ).toEqual({
      providerAssetId: "asset-uuid-4",
      status: "FAILED",
      failureReason: "MediaConvert job state CANCELED",
      durationSeconds: null,
    });
  });

  it("maps unknown terminal-ish job states to FAILED", () => {
    expect(
      mapMediaConvertJobEvent({
        detail: { status: "ABORTED", userMetadata: { assetId: "asset-uuid-5" } },
      })?.status,
    ).toBe("FAILED");
  });

  it("maps unknown in-progress job states to PROCESSING", () => {
    expect(
      mapMediaConvertJobEvent({
        detail: { status: "NEW_DETAIL", userMetadata: { assetId: "asset-uuid-6" } },
      })?.status,
    ).toBe("PROCESSING");
  });

  it("parses an EventBridge JSON string the way SQS delivers the body", () => {
    expect(mapMediaConvertJobEvent(JSON.stringify(completeEvent))?.providerAssetId).toBe(
      "asset-uuid-1",
    );
  });

  it("returns null when the payload is not a MediaConvert job event we can apply", () => {
    expect(mapMediaConvertJobEvent(null)).toBeNull();
    expect(mapMediaConvertJobEvent("{")).toBeNull();
    expect(mapMediaConvertJobEvent({ detail: { status: "COMPLETE" } })).toBeNull();
    expect(
      mapMediaConvertJobEvent({ detail: { userMetadata: { assetId: "asset-uuid-1" } } }),
    ).toBeNull();
  });
});
