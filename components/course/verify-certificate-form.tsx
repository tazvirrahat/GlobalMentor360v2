import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSite } from "@/lib/site";

/**
 * "Check a certificate": a plain GET to /certificates, which normalises the
 * number (any case, dashes optional, a pasted link) and redirects to the
 * certificate's own page. Works without JavaScript.
 */
export function VerifyCertificateForm({
  id = "serial",
  defaultValue = "",
  error = null,
  autoFocus = false,
}: {
  id?: string;
  defaultValue?: string;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const prefix = getSite().certificatePrefix;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <form method="get" action="/certificates" className="flex flex-col gap-2" noValidate>
      <Label htmlFor={id}>Certificate number</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          name="serial"
          defaultValue={defaultValue}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={`${prefix}-1A2B-3C4D-5E6F-7A8B`}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          autoFocus={autoFocus}
          className="h-11 font-mono text-base sm:flex-1"
        />
        <Button type="submit" size="lg">
          Check certificate
        </Button>
      </div>
      <p id={hintId} className="text-sm text-graphite">
        Capital or small letters both work, and the dashes are optional. You can paste the link too.
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-seal">
          {error}
        </p>
      ) : null}
    </form>
  );
}
