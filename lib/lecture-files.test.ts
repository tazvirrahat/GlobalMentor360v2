import { describe, expect, it } from "vitest";
import { audioSeconds, isLectureFileKey, lectureFileKey, lectureFileKind, lectureFileName } from "./lecture-files";

describe("lectureFileKind", () => {
  it("knows audio and PDF, and nothing else", () => {
    expect(lectureFileKind("audio/mpeg")).toBe("AUDIO");
    expect(lectureFileKind("audio/mp4; codecs=mp4a")).toBe("AUDIO");
    expect(lectureFileKind("application/pdf")).toBe("FILE");
    expect(lectureFileKind("video/mp4")).toBeNull();
    expect(lectureFileKind("")).toBeNull();
  });
});

describe("keys", () => {
  it("keeps a lecture's files in its own folder under a safe name", () => {
    const key = lectureFileKey("lec1", "f1", "Week 1 / slides (final).pdf");
    expect(key).toBe("lecture-files/lec1/f1/slides-final-.pdf");
    expect(isLectureFileKey(key, "lec1")).toBe(true);
    expect(isLectureFileKey(key, "lec2")).toBe(false);
    expect(isLectureFileKey("lecture-files/lec1/../x.pdf", "lec1")).toBe(false);
    expect(isLectureFileKey("resources/lec1/f1/x.pdf", "lec1")).toBe(false);
    expect(lectureFileName(key)).toBe("slides-final-.pdf");
  });
});

describe("audioSeconds", () => {
  it("rounds, and treats nonsense as unknown", () => {
    expect(audioSeconds(125.6)).toBe(126);
    expect(audioSeconds(Number.NaN)).toBe(0);
    expect(audioSeconds(-3)).toBe(0);
    expect(audioSeconds(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
