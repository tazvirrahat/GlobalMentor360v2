import { bunnyProvider } from "./bunny";
import type { VideoProvider } from "./provider";

/**
 * The single place the vendor is named. Swapping providers means adding an
 * implementation and changing this line.
 */
export const video: VideoProvider = bunnyProvider;

export * from "./provider";
