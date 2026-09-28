# Features, plan 12: player extras

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec §12 "Player: video quality selector (HLS levels), auto-advance on/off toggle, audio lecture type, PDF lecture type, interactive transcript from captions."

**Architecture:**

- **Quality and auto-advance** live in `video-player.tsx`'s control bar beside Speed. Quality lists hls.js's levels after `MANIFEST_PARSED` ("Auto" plus one entry per height, highest first) and sets `hls.currentLevel`; the choice is remembered per browser by height. Auto-advance becomes a remembered checkbox ("Play the next lesson automatically", on by default). When a video ends and completes the lecture, auto-advance shows a five-second countdown with Cancel (WCAG 2.2.1: the learner can stop it) instead of the silent 1.5 s jump; with it off, the page refreshes so the "Next lesson" button appears.
- **Transcript**: captions are VTT files in S3. `lib/vtt.ts` parses a VTT body into cues; `attachUploadedCaption` stores them in the existing `transcripts` table (one row per asset and language) so the player never reads S3 to show them. The player gains a Transcript tab on video lectures that have one (English first, otherwise the first language): each cue is a button with its time; activating it seeks the video (`requestSeek` from `player-clock.ts`); the cue under the playhead is marked with the highlighter (`--mark`, "you are here") and `aria-current="time"`. The page never scrolls on its own.
- **Audio and PDF lectures** use `LectureContentType.AUDIO` and `FILE`, which exist but nothing writes. The file sits in the app bucket under `lecture-files/<lectureId>/…`, uploaded by presigned PUT like resources; finishing creates a `MediaAsset` with `provider = "file"`, `status = READY`, `originalKey` = the key (and `durationSeconds` for audio, read by the browser before upload), and points the lecture at it. `/api/lecture-file/<itemId>` redirects to a short-lived presigned GET after the player's media check (`canAccessItemMedia`). The player renders `<audio controls>` or the PDF in an `<iframe>` with Open and Download links (phones that cannot show a PDF inline still get the file). Audio and PDF lectures complete with Mark complete, like articles. `releaseOrphanedLectureAsset` deletes a file asset's object; Admin › Videos counts only video assets.

**Tech Stack:** hls.js 1.6 (already a dependency), Next.js 16 route handlers and server actions, `@aws-sdk/client-s3`, Vitest, Playwright.

## Global Constraints

- No schema change (`AUDIO`, `FILE`, `transcripts`, `media_assets.provider/originalKey` exist).
- Access to audio and PDF files is exactly the video rule: enrolled (and unlocked in order), or a free preview.
- Uploads: audio `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/ogg`, `audio/wav`, `audio/webm` up to 200 MB; PDF `application/pdf` up to 50 MB. With storage unset (local), the studio says so plainly.
- Controls in the dark video bar keep a visible focus ring and 24 px targets; the transcript's buttons are at least 24 px tall.
- Remembered choices (speed, quality, auto-advance) are browser-local conveniences, read through `useSyncExternalStore` like speed.

## File map

| File | Change | Responsibility |
|---|---|---|
| `lib/player.ts` (+ test) | modify | `qualityOptions(levels)`, `activeCueIndex(cues, time)`, the `transcript` tab |
| `app/(learn)/learn/[slug]/video-player.tsx` | modify | Quality select, auto-advance checkbox, countdown with Cancel |
| `lib/vtt.ts` (+ test) | create | `parseVtt(body)` → `{ start, end, text }[]` |
| `lib/captions.ts` | modify | store the transcript when a caption is attached; `getTranscriptForAsset(assetId)` |
| `app/(learn)/learn/[slug]/transcript-panel.tsx` | create | cues as seek buttons, current cue marked |
| `app/(learn)/learn/[slug]/[itemId]/page.tsx` | modify | Transcript tab; audio and PDF lessons |
| `lib/lecture-files.ts` (+ test) | create | allowed types and caps, `lectureFileKey`, `isLectureFileKey` |
| `app/(app)/studio/lecture-file-actions.ts` | create | start upload, finish (MediaAsset + contentType), remove |
| `…/curriculum/[itemId]/lecture-file-panel.tsx`, `page.tsx` | create/modify | "Audio or PDF" panel on the lecture editor |
| `app/api/lecture-file/[itemId]/route.ts` | create | access-checked redirect |
| `lib/video/release-asset.ts`, `lib/video-jobs.ts` | modify | delete a file asset's object; count video assets only |
| `components/course/course-module.tsx`, `…/curriculum/video-upload.tsx` | modify | audio and PDF icons and labels |
| `tests/integration/lecture-files.test.ts`, `transcripts.test.ts` | create | guards, access, transcript storage |

---

### Task 1: Quality and auto-advance

- [x] `qualityOptions(levels: { height: number }[])` → `[{ value: -1, label: "Auto" }, { value: i, label: "720p" }, …]`, highest first, one per height; unit tests.
- [x] Control bar: Speed, Quality (only when there are two or more levels), "Play the next lesson automatically" checkbox. Remembered in localStorage (`gm360.quality` as a height, `gm360.autoplayNext`).
- [x] Ended + completed: auto-advance on → `role="status"` countdown "Next lesson in 5 s" with Cancel; off → `router.refresh()` so "Next lesson" shows.
- [x] Commit `Add quality and auto-advance controls to the video player`.

### Task 2: Transcript

- [x] `parseVtt`: cue timings `hh:mm:ss.mmm` or `mm:ss.mmm`, optional cue ids, multi-line text joined, tags stripped, `NOTE`/`STYLE`/`REGION` blocks skipped, at most 5,000 cues; unit tests.
- [x] `attachUploadedCaption` upserts the transcript for that asset and language; `getTranscriptForAsset(assetId)` prefers `en`.
- [x] `activeCueIndex(cues, seconds)`; Transcript tab (video lectures with a transcript): buttons "0:12 text", seek on activate, current cue `bg-mark` + `aria-current="time"`.
- [x] Integration test: attaching a caption (storage stubbed) stores the cues; unit tests for the parser and `activeCueIndex`.
- [x] Commit `Show an interactive transcript from a lecture's captions`.

### Task 3: Audio and PDF lectures

- [x] `lib/lecture-files.ts`: types, caps, keys; unit tests.
- [x] Studio actions (owner-scoped): `startLectureFileUpload`, `finishLectureFileUpload` (HEAD size and type; MediaAsset `file`; lecture → AUDIO/FILE; previous asset released), `removeLectureFile` (back to Article).
- [x] Lecture editor "Audio or PDF" panel: current file (type, size or length), Upload / Replace / Remove; storage unset → plain note. Curriculum rows and outlines label Audio and PDF with their own icons.
- [x] `/api/lecture-file/[itemId]`: `canAccessItemMedia`, then a 5-minute presigned GET (inline for audio and PDF, `private, no-store`); 404 otherwise.
- [x] Player: `<audio controls preload="metadata">` with the title as its name; PDF in an `<iframe title="PDF: …">` (min height 70vh) with Open in a new tab and Download.
- [x] Integration tests: owner-scoped writes, key checks, access decisions; Admin › Videos counts only `provider <> 'file'`.
- [x] Commit `Let lectures be audio or a PDF`.

### Task 4: Checks

- [x] lint, typecheck, unit, `db:test:prepare --fresh`, SQL suites, flows, e2e, build, `ui-audit` + summary.
- [x] Progress log row; commit; push.
