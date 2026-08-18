import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebhookEvent } from "./provider";

const { findUnique, update, updateMany, findMany } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    mediaAsset: { findUnique, update },
    lecture: { updateMany, findMany },
  },
}));

const { applyMediaConvertJobEvent } = await import("./apply-job-event");

function event(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    providerAssetId: "prov-1",
    status: "READY",
    failureReason: null,
    durationSeconds: 12,
    ...overrides,
  };
}

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset().mockResolvedValue({});
  updateMany.mockReset().mockResolvedValue({ count: 0 });
  findMany.mockReset().mockResolvedValue([]);
});

describe("applyMediaConvertJobEvent", () => {
  it("ignores events for an unknown asset", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await applyMediaConvertJobEvent(event())).toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });

  it("applies PROCESSING → READY", async () => {
    findUnique.mockResolvedValueOnce({ id: "asset-1", status: "PROCESSING" });
    await applyMediaConvertJobEvent(event({ status: "READY" }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asset-1" },
        data: expect.objectContaining({ status: "READY" }),
      }),
    );
  });

  it("never lets a late ERROR overwrite READY", async () => {
    findUnique.mockResolvedValueOnce({ id: "asset-1", status: "READY" });
    await applyMediaConvertJobEvent(
      event({ status: "FAILED", failureReason: "late error", durationSeconds: null }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("never lets a late PROGRESSING overwrite READY", async () => {
    findUnique.mockResolvedValueOnce({ id: "asset-1", status: "READY" });
    await applyMediaConvertJobEvent(event({ status: "PROCESSING", durationSeconds: null }));
    expect(update).not.toHaveBeenCalled();
  });

  it("never lets a late PROGRESSING overwrite FAILED", async () => {
    findUnique.mockResolvedValueOnce({ id: "asset-1", status: "FAILED" });
    await applyMediaConvertJobEvent(event({ status: "PROCESSING", durationSeconds: null }));
    expect(update).not.toHaveBeenCalled();
  });

  it("does not promote FAILED → READY when the master manifest is missing", async () => {
    findUnique.mockResolvedValueOnce({ id: "asset-1", status: "FAILED" });
    await applyMediaConvertJobEvent(event({ status: "READY" }), {
      masterManifestExists: async () => false,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("promotes FAILED → READY only when the master manifest exists", async () => {
    findUnique.mockResolvedValueOnce({ id: "asset-1", status: "FAILED" });
    await applyMediaConvertJobEvent(event({ status: "READY" }), {
      masterManifestExists: async () => true,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asset-1" },
        data: expect.objectContaining({ status: "READY" }),
      }),
    );
  });

  it("allows a duplicate COMPLETE to refresh duration on an already READY row", async () => {
    findUnique.mockResolvedValueOnce({ id: "asset-1", status: "READY" });
    await applyMediaConvertJobEvent(event({ status: "READY", durationSeconds: 99 }));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "READY", durationSeconds: 99 }),
      }),
    );
  });
});
