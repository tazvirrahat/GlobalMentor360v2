import { describe, expect, it } from "vitest";
import { mediaAssetMatchesUpload } from "./upload-bind";

const actor = { userId: "user-1", itemId: "item-1" };

describe("mediaAssetMatchesUpload", () => {
  it("accepts the instructor and item that started the upload", () => {
    expect(
      mediaAssetMatchesUpload(
        { createdByUserId: "user-1", startedForItemId: "item-1" },
        actor,
      ),
    ).toBe(true);
  });

  it("rejects another instructor attaching the same UPLOADING row", () => {
    expect(
      mediaAssetMatchesUpload(
        { createdByUserId: "user-1", startedForItemId: "item-1" },
        { userId: "user-2", itemId: "item-1" },
      ),
    ).toBe(false);
  });

  it("rejects the same instructor attaching it to a different lecture", () => {
    expect(
      mediaAssetMatchesUpload(
        { createdByUserId: "user-1", startedForItemId: "item-1" },
        { userId: "user-1", itemId: "item-2" },
      ),
    ).toBe(false);
  });

  it("rejects a pre-bind row (both columns null) rather than fail open", () => {
    expect(
      mediaAssetMatchesUpload({ createdByUserId: null, startedForItemId: null }, actor),
    ).toBe(false);
  });
});
