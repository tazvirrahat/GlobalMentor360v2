import { describe, expect, it } from "vitest";
import { normalizeSerial } from "./certificate-serial";

const SERIAL = "GM360-1A2B-3C4D-5E6F-7A8B";

describe("normalizeSerial", () => {
  it("accepts the serial in any case, with stray spaces", () => {
    expect(normalizeSerial(" gm360-1a2b-3c4d-5e6f-7a8b ", "GM360")).toBe(SERIAL);
    expect(normalizeSerial("GM360 - 1A2B - 3C4D - 5E6F - 7A8B", "GM360")).toBe(SERIAL);
  });

  it("accepts the 16 characters without the prefix or dashes", () => {
    expect(normalizeSerial("1A2B 3C4D 5E6F 7A8B", "GM360")).toBe(SERIAL);
    expect(normalizeSerial("1a2b3c4d5e6f7a8b", "GM360")).toBe(SERIAL);
  });

  it("accepts a pasted certificate link", () => {
    expect(normalizeSerial(`https://learn.example.com/certificates/${SERIAL}`, "GM360")).toBe(SERIAL);
    expect(normalizeSerial(`https://learn.example.com/certificates/${SERIAL}/pdf`, "GM360")).toBe(SERIAL);
  });

  it("rejects anything that cannot be a serial", () => {
    expect(normalizeSerial("", "GM360")).toBeNull();
    expect(normalizeSerial("hello", "GM360")).toBeNull();
    expect(normalizeSerial("GM360-1A2B-3C4D", "GM360")).toBeNull();
    expect(normalizeSerial("XX999-1A2B-3C4D-5E6F-7A8B", "GM360")).toBeNull();
    expect(normalizeSerial("1A2B3C4D5E6F7A8G", "GM360")).toBeNull();
  });
});
