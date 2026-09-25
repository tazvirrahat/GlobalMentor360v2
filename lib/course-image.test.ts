import { describe, expect, it } from "vitest";
import { courseImageKey, courseImageUrl, isCourseImageKey, isCourseImageType } from "./course-image";

describe("course images", () => {
  it("accepts JPEG, PNG and WebP only", () => {
    expect(isCourseImageType("image/jpeg")).toBe(true);
    expect(isCourseImageType("image/webp")).toBe(true);
    expect(isCourseImageType("image/gif")).toBe(false);
    expect(isCourseImageType("image/svg+xml")).toBe(false);
  });

  it("keeps keys inside the course's folder", () => {
    const key = courseImageKey("c1", "abc-123", "image/png");
    expect(key).toBe("course-images/c1/abc-123.png");
    expect(isCourseImageKey(key, "c1")).toBe(true);
    expect(isCourseImageKey(key, "c2")).toBe(false);
    expect(isCourseImageKey("course-images/c1/../c2/x.png", "c1")).toBe(false);
    expect(isCourseImageKey("resources/c1/x.png", "c1")).toBe(false);
  });

  it("versions the URL by file id and falls back to the tile", () => {
    expect(courseImageUrl("c1", "course-images/c1/abc-123.png")).toBe("/api/course-images/c1?v=abc-123");
    expect(courseImageUrl("c1", null)).toBeNull();
    expect(courseImageUrl("c1", "https://elsewhere.example/x.png")).toBeNull();
  });
});
