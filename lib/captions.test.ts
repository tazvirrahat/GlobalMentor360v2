import { describe, expect, it } from "vitest";
import { isCaptionLanguage, looksLikeVtt } from "./captions";
import { captionObjectKey } from "./video/aws";

describe("isCaptionLanguage", () => {
  it("accepts short language codes", () => {
    expect(isCaptionLanguage("en")).toBe(true);
    expect(isCaptionLanguage("en-US")).toBe(true);
    expect(isCaptionLanguage("bn")).toBe(true);
  });

  it("rejects free-form labels", () => {
    expect(isCaptionLanguage("English")).toBe(false);
    expect(isCaptionLanguage("en_US")).toBe(false);
    expect(isCaptionLanguage("")).toBe(false);
  });
});

describe("looksLikeVtt", () => {
  it("requires the WEBVTT signature", () => {
    expect(looksLikeVtt("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi")).toBe(true);
    expect(looksLikeVtt("\uFEFFWEBVTT\n")).toBe(true);
    expect(looksLikeVtt("1\n00:00:00,000 --> 00:00:01,000\nSRT is not VTT")).toBe(false);
  });
});

describe("captionObjectKey", () => {
  it("stores captions under captions/{providerAssetId}/ so deleteAsset can find them", () => {
    expect(captionObjectKey("prov-asset-1", "en")).toBe("captions/prov-asset-1/en.vtt");
    expect(captionObjectKey("prov-asset-1", "en")).not.toContain("media-row-id");
  });
});
