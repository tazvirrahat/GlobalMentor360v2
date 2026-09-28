import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LectureNote } from "@/lib/notes";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { NoteForm, NoteTime } from "./note-form";
import { deleteNoteAction, toggleBookmarkAction } from "./note-actions";

export function BookmarkButton({ itemId, slug, bookmarked }: { itemId: string; slug: string; bookmarked: boolean }) {
  return (
    <form action={toggleBookmarkAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="slug" value={slug} />
      <Button type="submit" variant="secondary" size="sm" aria-pressed={bookmarked}>
        {bookmarked ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
        {bookmarked ? "Bookmarked" : "Bookmark"}
      </Button>
    </form>
  );
}

/** Your notes on this lesson: newest first, each able to jump the video to its moment. */
export function NotesPanel({
  lectureId,
  itemId,
  slug,
  notes,
  hiddenByPageSize = 0,
}: {
  lectureId: string;
  itemId: string;
  slug: string;
  notes: LectureNote[];
  hiddenByPageSize?: number;
}) {
  return (
    <section aria-labelledby="notes-heading" className="flex flex-col gap-5">
      <h2 id="notes-heading" className="sr-only">
        Notes
      </h2>
      <NoteForm lectureId={lectureId} itemId={itemId} slug={slug} />
      {notes.length > 0 ? (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-2 py-3">
              <p className="text-base whitespace-pre-line text-ink">{note.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                <NoteTime seconds={note.timestampSeconds} />
                <form action={deleteNoteAction} className="ml-auto">
                  <input type="hidden" name="noteId" value={note.id} />
                  <input type="hidden" name="itemId" value={itemId} />
                  <input type="hidden" name="slug" value={slug} />
                  <ConfirmSubmit label="Delete" question="Delete this note?" confirmLabel="Delete note" />
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-graphite">No notes on this lesson yet.</p>
      )}
      {hiddenByPageSize > 0 ? (
        <p className="text-sm text-graphite">
          Showing the {notes.length} newest of {notes.length + hiddenByPageSize} notes.
        </p>
      ) : null}
    </section>
  );
}
