import { describe, expect, it } from "vitest";
import { parseVtt } from "./vtt";

describe("parseVtt", () => {
  it("reads cues with or without ids and hours, joining lines and dropping markup", () => {
    const body = [
      "﻿WEBVTT - Lesson 1",
      "",
      "1",
      "00:00:01.000 --> 00:00:04.250 align:start position:10%",
      "<v Dana>Welcome to <b>TypeScript</b>.</v>",
      "Let's begin.",
      "",
      "NOTE This is a comment",
      "that spans lines",
      "",
      "00:05.500 --> 00:07.000",
      "Types &amp; values",
      "",
    ].join("\r\n");
    expect(parseVtt(body)).toEqual([
      { start: 1, end: 4.25, text: "Welcome to TypeScript. Let's begin." },
      { start: 5.5, end: 7, text: "Types & values" },
    ]);
  });

  it("skips STYLE blocks, broken timings and empty cues", () => {
    const body = [
      "WEBVTT",
      "",
      "STYLE",
      "::cue { color: yellow }",
      "",
      "00:00:01.000 --> nonsense",
      "Broken",
      "",
      "00:00:02.000 --> 00:00:03.000",
      "<i></i>",
      "",
      "01:00:00.000 --> 01:00:02.000",
      "An hour in",
    ].join("\n");
    expect(parseVtt(body)).toEqual([{ start: 3600, end: 3602, text: "An hour in" }]);
  });
});
