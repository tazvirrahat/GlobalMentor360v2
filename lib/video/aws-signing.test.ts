import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { awsProvider } from "./aws";
import { VideoProviderError } from "./provider";

const ENV_KEYS = [
  "AWS_CLOUDFRONT_DOMAIN",
  "AWS_CLOUDFRONT_KEY_PAIR_ID",
  "AWS_CLOUDFRONT_PRIVATE_KEY",
] as const;

const previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function snapshotEnv() {
  for (const key of ENV_KEYS) {
    previous[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function decodeCloudFrontPolicy(policyParam: string): { Statement: { Resource: string }[] } {
  const b64 = policyParam.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as {
    Statement: { Resource: string }[];
  };
}

function testPrivateKeyPem() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

describe("CloudFront playback signing", () => {
  snapshotEnv();
  afterEach(restoreEnv);

  it("signs the HLS URL when CloudFront keys are set", () => {
    process.env.AWS_CLOUDFRONT_DOMAIN = "d111111abcdef8.cloudfront.net";
    process.env.AWS_CLOUDFRONT_KEY_PAIR_ID = "KTESTPAIRID";
    process.env.AWS_CLOUDFRONT_PRIVATE_KEY = testPrivateKeyPem();

    const playback = awsProvider.signPlaybackUrl("asset-uuid-1");
    const url = new URL(playback.hlsUrl);

    expect(url.host).toBe("d111111abcdef8.cloudfront.net");
    expect(url.pathname).toBe("/hls/asset-uuid-1/index.m3u8");
    expect(url.searchParams.get("Key-Pair-Id")).toBe("KTESTPAIRID");
    expect(url.searchParams.get("Signature")).toBeTruthy();
    const policyParam = url.searchParams.get("Policy");
    expect(policyParam).toBeTruthy();
    const policy = decodeCloudFrontPolicy(policyParam!);
    expect(policy.Statement[0]?.Resource).toBe(
      "https://d111111abcdef8.cloudfront.net/hls/asset-uuid-1/*",
    );
  });

  it("accepts a PEM stored with literal \\n escapes", () => {
    const pem = testPrivateKeyPem();
    process.env.AWS_CLOUDFRONT_DOMAIN = "d111111abcdef8.cloudfront.net";
    process.env.AWS_CLOUDFRONT_KEY_PAIR_ID = "KTESTPAIRID";
    process.env.AWS_CLOUDFRONT_PRIVATE_KEY = pem.replace(/\n/g, "\\n");

    const playback = awsProvider.signPlaybackUrl("asset-uuid-2");
    const url = new URL(playback.hlsUrl);
    expect(url.searchParams.get("Signature")).toBeTruthy();
    const policy = decodeCloudFrontPolicy(url.searchParams.get("Policy")!);
    expect(policy.Statement[0]?.Resource).toBe(
      "https://d111111abcdef8.cloudfront.net/hls/asset-uuid-2/*",
    );
  });

  it("refuses to return an unsigned URL when CloudFront keys are missing", () => {
    delete process.env.AWS_CLOUDFRONT_DOMAIN;
    delete process.env.AWS_CLOUDFRONT_KEY_PAIR_ID;
    delete process.env.AWS_CLOUDFRONT_PRIVATE_KEY;

    expect(() => awsProvider.signPlaybackUrl("asset-uuid-1")).toThrow(VideoProviderError);
  });
});
