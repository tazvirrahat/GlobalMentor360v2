/**
 * Refreshes every rated course's ranking score (Course.ratingScore), whose
 * recency weights move with the date. Schedule daily in production, e.g.
 *   15 3 * * *  cd /app && npm run ratings:recompute
 * Uses DATABASE_URL like the app. Safe to run at any time: each course is
 * recomputed from its reviews under the same row lock review writes take.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { recomputeAllCourseRatings } from "../lib/reviews";

const count = await recomputeAllCourseRatings();
console.log(`Recomputed ratings for ${count} ${count === 1 ? "course" : "courses"}.`);
await db.$disconnect();
