import { Bookmark, BookmarkCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { LectureNote } from "@/lib/notes";
import { addNoteAction, deleteNoteAction, toggleBookmarkAction } from "./note-actions";

export function BookmarkButton({
  itemId,
  slug,
  bookmarked,
}: {
  itemId: string;
  slug: string;
  bookmarked: boolean;
}) {
  return (
    <form action={toggleBookmarkAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="slug" value={slug} />
      <Button type="submit" variant="outline">
        {bookmarked ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
        {bookmarked ? "Bookmarked" : "Bookmark"}
      </Button>
    </form>
  );
}

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
    <section className="rounded-lg border bg-card p-5 shadow-xs">
      <h2 className="font-heading text-lg font-semibold tracking-tight">Notes</h2>
      <form action={addNoteAction} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="lectureId" value={lectureId} />
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="slug" value={slug} />
        <Textarea
          name="body"
          rows={3}
          placeholder="Capture something from this lecture…"
          required
          maxLength={4000}
          aria-label="Note"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="timestampSeconds"
            type="number"
            min={0}
            defaultValue={0}
            className="w-28 tabular-nums"
            aria-label="Timestamp in seconds"
          />
          <Button type="submit">Save note</Button>
        </div>
      </form>
      {notes.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {hiddenByPageSize > 0 ? (
            <li className="text-xs text-muted-foreground">
              Showing the {notes.length} newest of {notes.length + hiddenByPageSize} notes.
            </li>
          ) : null}
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-line">{note.body}</p>
                <form action={deleteNoteAction}>
                  <input type="hidden" name="noteId" value={note.id} />
                  <input type="hidden" name="itemId" value={itemId} />
                  <input type="hidden" name="slug" value={slug} />
                  <Button type="submit" variant="ghost" size="icon" aria-label="Delete note">
                    <Trash2 className="size-4" />
                  </Button>
                </form>
              </div>
              {note.timestampSeconds > 0 ? (
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">{note.timestampSeconds}s</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
