import { missingParts, partRange, MAX_PARTS_PER_SIGN } from "@/lib/video/multipart";
import {
  cancelVideoUpload,
  finishResumableVideoUpload,
  resumeVideoUpload,
  signVideoUploadParts,
  startResumableVideoUpload,
  type VideoUploadTarget,
} from "../../../video-actions";

/**
 * The browser half of a resumable video upload. Parts go up three at a time,
 * each retried three times; an unfinished upload is remembered (per target and
 * file) so choosing the same file again continues from the parts S3 already
 * has. The server lists those parts itself before completing, so a lost
 * response here never corrupts the file.
 */

const RECORD_KEY = "gm360.videoUploads";
const CONCURRENCY = 3;
const RETRIES = 3;
/** S3 keeps unfinished multipart uploads until aborted; a week is plenty to come back. */
const RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type UploadRecord = {
  target: string;
  file: string;
  mediaAssetId: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  savedAt: number;
};

export type UploadEvents = {
  onProgress: (percent: number) => void;
  /** "resuming" when an earlier upload of this file continues. */
  onPhase?: (phase: "starting" | "resuming" | "uploading" | "finishing") => void;
  signal?: AbortSignal;
};

export type UploadOutcome = { ok: true } | { ok: false; message: string; cancelled?: boolean };

const targetKey = (target: VideoUploadTarget) => (target.kind === "lecture" ? `lecture:${target.itemId}` : `promo:${target.courseId}`);
const fileKey = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

function readRecords(): UploadRecord[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECORD_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((row) => Date.now() - Number(row?.savedAt) < RECORD_TTL_MS) : [];
  } catch {
    return [];
  }
}

function writeRecords(records: UploadRecord[]) {
  try {
    window.localStorage.setItem(RECORD_KEY, JSON.stringify(records));
  } catch {
    // Blocked storage: the upload works, it just can't be resumed after a reload.
  }
}

function forget(target: string, file: string) {
  writeRecords(readRecords().filter((row) => !(row.target === target && row.file === file)));
}

function remember(record: UploadRecord) {
  writeRecords([...readRecords().filter((row) => !(row.target === record.target && row.file === record.file)), record]);
}

class Cancelled extends Error {}

function putPart(url: string, body: Blob, onLoaded: (bytes: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Cancelled());
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => onLoaded(event.loaded);
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("The upload stopped because of a network error."));
    };
    xhr.onabort = () => reject(new Cancelled());
    xhr.send(body);
  });
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function uploadVideoResumable(file: File, target: VideoUploadTarget, events: UploadEvents): Promise<UploadOutcome> {
  const tKey = targetKey(target);
  const fKey = fileKey(file);
  let record = readRecords().find((row) => row.target === tKey && row.file === fKey) ?? null;
  let done: number[] = [];

  if (record) {
    events.onPhase?.("resuming");
    const resumed = await resumeVideoUpload({ target, mediaAssetId: record.mediaAssetId, uploadId: record.uploadId });
    if (resumed.ok) done = resumed.done;
    else {
      forget(tKey, fKey);
      record = null;
    }
  }
  if (!record) {
    events.onPhase?.("starting");
    const started = await startResumableVideoUpload({ target, contentType: file.type || "video/mp4", sizeBytes: file.size });
    if (!started.ok) return started;
    record = { target: tKey, file: fKey, ...started, savedAt: Date.now() };
    remember(record);
  }
  const { mediaAssetId, uploadId, partSize, partCount } = record;

  // Progress counts bytes: parts already in S3, plus what each part in flight has sent.
  const doneBytes = done.reduce((sum, n) => sum + (partRange(n, partSize, file.size).end - partRange(n, partSize, file.size).start), 0);
  let finishedBytes = doneBytes;
  const inFlight = new Map<number, number>();
  const report = () => {
    const sent = finishedBytes + [...inFlight.values()].reduce((sum, bytes) => sum + bytes, 0);
    events.onProgress(Math.min(99, Math.floor((sent / file.size) * 100)));
  };
  report();
  events.onPhase?.("uploading");

  const queue = missingParts(partCount, done);
  const urls = new Map<number, string>();

  async function urlFor(partNumber: number): Promise<string> {
    if (!urls.has(partNumber)) {
      const batch = queue.filter((n) => !urls.has(n)).slice(0, MAX_PARTS_PER_SIGN);
      const signed = await signVideoUploadParts({ target, mediaAssetId, uploadId, partCount, partNumbers: batch });
      if (!signed.ok) throw new Error(signed.message);
      for (const [n, url] of Object.entries(signed.urls)) urls.set(Number(n), url);
    }
    return urls.get(partNumber)!;
  }

  async function sendPart(partNumber: number) {
    const { start, end } = partRange(partNumber, partSize, file.size);
    for (let attempt = 1; ; attempt++) {
      try {
        const url = await urlFor(partNumber);
        await putPart(url, file.slice(start, end), (bytes) => {
          inFlight.set(partNumber, bytes);
          report();
        }, events.signal);
        inFlight.delete(partNumber);
        finishedBytes += end - start;
        report();
        return;
      } catch (error) {
        inFlight.delete(partNumber);
        if (error instanceof Cancelled || attempt >= RETRIES) throw error;
        await wait(1000 * 2 ** (attempt - 1));
      }
    }
  }

  let next = 0;
  async function worker() {
    while (next < queue.length) {
      const partNumber = queue[next++]!;
      await sendPart(partNumber);
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));
  } catch (error) {
    if (error instanceof Cancelled || events.signal?.aborted) {
      await cancelVideoUpload({ target, mediaAssetId, uploadId });
      forget(tKey, fKey);
      return { ok: false, message: "Upload cancelled.", cancelled: true };
    }
    return {
      ok: false,
      message: `${error instanceof Error ? error.message : "The upload stopped."} Pick the same file again to continue where it stopped.`,
    };
  }

  events.onPhase?.("finishing");
  const finished = await finishResumableVideoUpload({ target, mediaAssetId, uploadId, partCount });
  if (finished.ok) {
    forget(tKey, fKey);
    events.onProgress(100);
  }
  return finished;
}
