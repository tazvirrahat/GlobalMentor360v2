/**
 * An in-progress upload may only be finalized onto the curriculum item it was
 * started for, by the user who started it.
 *
 * Both columns are nullable so rows created before the bind still load.
 * Null fails this check — those uploads must be started again rather than
 * attached to whatever lecture the caller names.
 */
export function mediaAssetMatchesUpload(
  asset: {
    createdByUserId: string | null;
    startedForItemId: string | null;
  },
  actor: { userId: string; itemId: string },
): boolean {
  return asset.createdByUserId === actor.userId && asset.startedForItemId === actor.itemId;
}
