/**
 * WebVTT caption text → transcript cues, for the player's Transcript tab.
 * Only what a reader needs: start and end in seconds and the words, with
 * markup (<b>, <v Speaker>, timestamps) stripped. Pure.
 */

export type TranscriptCue = { start: number; end: number; text: string };

export const TRANSCRIPT_MAX_CUES = 5000;

const TIME = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/;

function seconds(stamp: string): number | null {
  const match = stamp.trim().match(TIME);
  if (!match) return null;
  const [, h, m, s, ms] = match;
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&quot;": '"', "&#39;": "'" };

function plain(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|nbsp|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVtt(body: string): TranscriptCue[] {
  const blocks = body
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);
  const cues: TranscriptCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) continue;
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0]!)) continue;
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0 || timing > 1) continue;
    const [from = "", rest = ""] = lines[timing]!.split("-->");
    const start = seconds(from);
    const end = seconds(rest.trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null || end < start) continue;
    const text = plain(lines.slice(timing + 1).join(" "));
    if (!text) continue;
    cues.push({ start, end, text });
    if (cues.length >= TRANSCRIPT_MAX_CUES) break;
  }
  return cues;
}
