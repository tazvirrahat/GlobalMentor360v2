import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./user-agent";

describe("describeUserAgent", () => {
  it("returns Unknown device for empty values", () => {
    expect(describeUserAgent(null)).toBe("Unknown device");
    expect(describeUserAgent("")).toBe("Unknown device");
    expect(describeUserAgent("   ")).toBe("Unknown device");
  });

  it("names Chrome on Windows before the Safari token in the same string", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on Windows");
  });

  it("names Edge before Chrome when both tokens are present", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      ),
    ).toBe("Edge on Windows");
  });

  it("names Firefox on macOS", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
      ),
    ).toBe("Firefox on macOS");
  });

  it("names Safari on iOS without treating it as macOS", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iOS");
  });

  it("names Android before the Linux token", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
      ),
    ).toBe("Chrome on Android");
  });

  it("falls back when the string has no known browser or OS", () => {
    expect(describeUserAgent("CustomClient/1.0")).toBe("Unknown device");
  });
});
