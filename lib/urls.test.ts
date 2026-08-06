import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./urls";

// A single backslash, built at runtime so no layer of shell/heredoc escaping can
// silently eat it and turn a hostile case into a benign one.
const BS = String.fromCharCode(92);

describe("safeReturnPath", () => {
  describe("allows same-origin paths", () => {
    it.each([
      ["/dashboard"],
      ["/courses/typescript-foundations"],
      ["/a?b=c#d"],
      // A path segment that merely looks like a host is still same-origin.
      ["/evil.example"],
    ])("keeps %s", (input) => {
      expect(safeReturnPath(input)).toBe(input);
    });
  });

  describe("rejects off-origin targets", () => {
    it.each([
      ["absolute https", "https://evil.example/pwn"],
      ["absolute http", "http://evil.example"],
      ["protocol-relative", "//evil.example/pwn"],
      ["slash-backslash", `/${BS}evil.example`],
      ["slash-double-backslash", `/${BS}${BS}evil.example`],
      ["javascript scheme", "javascript:alert(1)"],
      ["data scheme", "data:text/html,<script>alert(1)</script>"],
      ["bare relative", "dashboard"],
    ])("rejects %s", (_label, input) => {
      expect(safeReturnPath(input)).toBeNull();
    });
  });

  describe("rejects empty input", () => {
    it.each([[""], [null], [undefined]])("rejects %s", (input) => {
      expect(safeReturnPath(input)).toBeNull();
    });
  });
});
