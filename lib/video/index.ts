import { awsProvider } from "./aws";
import type { VideoProvider } from "./provider";

/**
 * The single place the vendor is named. Swapping providers means adding an
 * implementation and changing this line. (bunny.ts stays as the reference
 * implementation of the previous vendor.)
 */
export const video: VideoProvider = awsProvider;

export * from "./provider";
export { releaseOrphanedLectureAsset } from "./release-asset";
export {
  captionObjectKey,
  drainMediaConvertEventQueue,
  putCaptionObject,
  readCaptionObject,
  tryDrainMediaConvertEventQueue,
} from "./aws";
