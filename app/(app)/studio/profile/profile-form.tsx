"use client";

import { useActionState } from "react";
import { FieldError } from "@/components/site/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BIO_MAX, HEADLINE_MAX } from "@/lib/instructor-profile";
import { updateInstructorProfile, type ProfileState } from "./actions";

const initial: ProfileState = { status: "idle" };

export function ProfileForm({
  profile,
}: {
  profile: { headline: string | null; bio: string | null; websiteUrl: string | null; profilePublic: boolean };
}) {
  const [state, action, pending] = useActionState(updateInstructorProfile, initial);
  const error = (field: string) => (state.status === "error" && state.field === field ? state.message : undefined);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="headline">Headline</Label>
        <Input
          id="headline"
          name="headline"
          defaultValue={profile.headline ?? ""}
          maxLength={HEADLINE_MAX}
          placeholder="For example: Data analyst and SQL trainer"
          aria-describedby="headline-hint"
          aria-invalid={error("headline") ? true : undefined}
        />
        <p id="headline-hint" className="text-sm text-graphite">
          One line under your name, up to {HEADLINE_MAX} characters.
        </p>
        {error("headline") ? <FieldError message={error("headline")!} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bio">About you</Label>
        <Textarea
          id="bio"
          name="bio"
          defaultValue={profile.bio ?? ""}
          maxLength={BIO_MAX}
          rows={8}
          aria-describedby="bio-hint"
          aria-invalid={error("bio") ? true : undefined}
        />
        <p id="bio-hint" className="text-sm text-graphite">
          Your experience and what you teach. Leave a blank line between paragraphs.
        </p>
        {error("bio") ? <FieldError message={error("bio")!} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="websiteUrl">Website (optional)</Label>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="text"
          inputMode="url"
          autoComplete="url"
          defaultValue={profile.websiteUrl ?? ""}
          placeholder="example.com"
          className="sm:max-w-md"
          aria-invalid={error("websiteUrl") ? true : undefined}
        />
        {error("websiteUrl") ? <FieldError message={error("websiteUrl")!} /> : null}
      </div>

      <label className="flex min-h-8 w-fit cursor-pointer items-center gap-2.5 text-ink">
        <input
          type="checkbox"
          name="profilePublic"
          defaultChecked={profile.profilePublic}
          className="size-6 shrink-0 cursor-pointer accent-ink"
        />
        Show my instructor page to everyone
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        <p role="status" className="text-sm font-medium text-ink">
          {state.status === "done" ? state.message : ""}
        </p>
        {state.status === "error" && !state.field ? <FieldError message={state.message} /> : null}
      </div>
    </form>
  );
}
