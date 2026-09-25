"use client";

import { useActionState, useState } from "react";
import { EmailDeliveryNote } from "@/components/auth/email-delivery-note";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  changeEmailAction,
  changePasswordAction,
  revokeOtherSessionsAction,
  updateNameAction,
  type AccountState,
} from "./actions";

const initial: AccountState = { status: "idle" };

/** The inline result line every account form shares. */
function Result({ state, id }: { state: AccountState; id: string }) {
  return (
    <p
      id={id}
      role="status"
      className={cn("min-h-5 text-sm font-medium", state.status === "error" ? "text-seal" : "text-ink")}
    >
      {state.status === "idle" ? "" : state.message}
    </p>
  );
}

export function ChangeNameForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState(updateNameAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          defaultValue={currentName}
          required
          maxLength={100}
          className="sm:max-w-80"
          aria-describedby="name-hint name-result"
          aria-invalid={state.status === "error" ? true : undefined}
        />
        <p id="name-hint" className="text-sm text-graphite">
          Your certificates show this name.
        </p>
      </div>
      <Result state={state} id="name-result" />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
          minLength={12}
          wrapperClassName="sm:max-w-80"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={12}
          wrapperClassName="sm:max-w-80"
          aria-describedby="new-password-hint"
        />
        <p id="new-password-hint" className="text-sm text-graphite">
          At least 12 characters.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={12}
          wrapperClassName="sm:max-w-80"
        />
      </div>
      <Result state={state} id="password-result" />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, pending] = useActionState(changeEmailAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-graphite">
        Current address: <strong className="font-semibold text-ink">{currentEmail}</strong>
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newEmail">New email</Label>
        <Input id="newEmail" name="newEmail" type="email" required autoComplete="email" className="sm:max-w-80" />
      </div>
      <div>
        <Result state={state} id="email-result" />
        {state.status === "done" ? <EmailDeliveryNote /> : null}
      </div>
      <Button type="submit" disabled={pending} variant="secondary" className="w-fit">
        {pending ? "Sending…" : "Change email"}
      </Button>
    </form>
  );
}

/** Signs out every other device, after asking. */
export function RevokeOthersForm() {
  const [state, action, pending] = useActionState(async (): Promise<AccountState> => revokeOtherSessionsAction(), initial);
  const [asking, setAsking] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-2" onSubmit={() => setAsking(false)}>
      {asking ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sign out other devices?">
          <span className="text-sm font-medium text-ink">Sign out every other device?</span>
          <Button type="submit" variant="destructive" size="sm" disabled={pending} autoFocus>
            {pending ? "Signing out…" : "Sign them out"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setAsking(true)}>
          Sign out other devices
        </Button>
      )}
      <Result state={state} id="revoke-result" />
    </form>
  );
}
