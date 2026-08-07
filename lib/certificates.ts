import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Certificates are issued once, when CourseProgress hits 100%. The serial is
 * public — anyone with it can verify on /certificates/[serial] — so it must be
 * unique, unguessable, and readable.
 *
 * Collision handling: the unique constraint is the source of truth. We retry a
 * handful of times rather than inventing a coordination table.
 */

function mintSerial(): string {
  // 8 bytes → 16 hex chars → GM360-XXXX-XXXX-XXXX-XXXX
  const hex = randomBytes(8).toString("hex").toUpperCase();
  return `GM360-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

/**
 * Idempotent. Returns the existing certificate when one already exists for this
 * enrollment, or creates one. Callers must have already confirmed the course is
 * complete — this function does not re-check progress.
 */
export async function issueCertificate(userId: string, courseId: string) {
  const existing = await db.certificate.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await db.certificate.create({
        data: { userId, courseId, serial: mintSerial() },
      });
    } catch (error) {
      // Unique violation on serial — try again. Unique on (userId, courseId)
      // means a concurrent caller won the race; re-read and return theirs.
      const raced = await db.certificate.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });
      if (raced) return raced;
      if (attempt === 4) throw error;
    }
  }

  throw new Error("Failed to mint a unique certificate serial.");
}

/**
 * Called from the progress recompute path the moment percent hits 100. Kept as
 * a thin wrapper so the call site reads as intent, not implementation.
 */
export async function issueCertificateIfComplete(userId: string, courseId: string) {
  const progress = await db.courseProgress.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { percent: true, completedAt: true },
  });

  if (!progress || progress.percent < 100 || !progress.completedAt) return null;
  return issueCertificate(userId, courseId);
}

export async function getCertificateBySerial(serial: string) {
  return db.certificate.findUnique({
    where: { serial },
    select: {
      serial: true,
      issuedAt: true,
      user: { select: { name: true } },
      course: { select: { title: true, slug: true } },
    },
  });
}
