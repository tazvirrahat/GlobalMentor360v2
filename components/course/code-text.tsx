/**
 * Text an instructor typed, with `backtick` spans shown as code: the one bit
 * of markup the studio promises (the lesson editor's hint says so). Anything
 * else stays plain text, so nothing an author types can inject markup.
 */
export function CodeText({ text }: { text: string }) {
  return text.split(/(`[^`\n]+`)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={index} className="rounded-sm bg-wash px-1 font-mono text-[0.9em] text-ink">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}
