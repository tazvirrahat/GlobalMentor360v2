import { describe, expect, it } from "vitest";
import { FAQ_MAX, readFaqRows } from "./course-faq";

describe("readFaqRows", () => {
  it("pairs questions with answers in order and trims them", () => {
    expect(readFaqRows(["  Is it self-paced? ", "Do I get a certificate?"], ["Yes.", " When you finish. "])).toEqual({
      ok: true,
      rows: [
        { question: "Is it self-paced?", answer: "Yes." },
        { question: "Do I get a certificate?", answer: "When you finish." },
      ],
    });
  });

  it("drops rows that are blank on both sides", () => {
    expect(readFaqRows(["Q", "", "  "], ["A", "", ""])).toEqual({ ok: true, rows: [{ question: "Q", answer: "A" }] });
    expect(readFaqRows([], [])).toEqual({ ok: true, rows: [] });
  });

  it("refuses a half-filled row", () => {
    expect(readFaqRows(["A question"], [""]).ok).toBe(false);
    expect(readFaqRows([""], ["An answer"]).ok).toBe(false);
    expect(readFaqRows(["One"], []).ok).toBe(false);
  });

  it("refuses over-long text and too many rows", () => {
    expect(readFaqRows(["x".repeat(301)], ["a"]).ok).toBe(false);
    expect(readFaqRows(["q"], ["x".repeat(2001)]).ok).toBe(false);
    const many = Array.from({ length: FAQ_MAX + 1 }, (_, index) => `Q${index}`);
    expect(readFaqRows(many, many).ok).toBe(false);
  });
});
