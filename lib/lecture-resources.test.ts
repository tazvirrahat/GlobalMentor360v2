import { describe, expect, it } from "vitest";
import { formatFileSize, isKeyForLecture, parseResourceLink, resourceStorageKey, safeDownloadName } from "./lecture-resources";

describe("parseResourceLink", () => {
  it("accepts a named http(s) link and adds https:// to a bare domain", () => {
    expect(parseResourceLink(" Docs ", "docs.example.com/guide")).toEqual({
      ok: true,
      value: { title: "Docs", url: "https://docs.example.com/guide" },
    });
  });

  it("refuses a missing name, a missing URL and other schemes", () => {
    expect(parseResourceLink("", "https://example.com").ok).toBe(false);
    expect(parseResourceLink("Docs", "").ok).toBe(false);
    expect(parseResourceLink("Docs", "javascript:alert(1)").ok).toBe(false);
    expect(parseResourceLink("Docs", "data:text/html,hi").ok).toBe(false);
  });
});

describe("file names and keys", () => {
  it("strips paths and control characters from download names", () => {
    expect(safeDownloadName("../../etc/passwd")).toBe("passwd");
    expect(safeDownloadName("C:\\Users\\me\\Slides.pdf")).toBe("Slides.pdf");
    expect(safeDownloadName("a\u0000b.txt")).toBe("ab.txt");
    expect(safeDownloadName("")).toBe("download");
  });

  it("builds keys inside the lecture's folder", () => {
    expect(resourceStorageKey("lec1", "f1", "My notes (v2).pdf")).toBe("resources/lec1/f1/My-notes-v2-.pdf");
    expect(isKeyForLecture("resources/lec1/f1/x.pdf", "lec1")).toBe(true);
    expect(isKeyForLecture("resources/lec2/f1/x.pdf", "lec1")).toBe(false);
    expect(isKeyForLecture("resources/lec1/../lec2/x.pdf", "lec1")).toBe(false);
  });

  it("formats sizes", () => {
    expect(formatFileSize(1)).toBe("1 byte");
    expect(formatFileSize(830 * 1024)).toBe("830 KB");
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });
});
