"use client";

import { useActionState } from "react";
import { EmailDeliveryNote } from "@/components/auth/email-delivery-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeEmailAction,
  changePasswordAction,
  revokeOtherSessionsAction,
  type AccountState,
} from "./actions";

const initial: AccountState = { status: "idle" };

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </div>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={
            state.status === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium"
          }
        >
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit shadow-brand">
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, pending] = useActionState(changeEmailAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Current address: <strong>{currentEmail}</strong>
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newEmail">New email</Label>
        <Input id="newEmail" name="newEmail" type="email" required autoComplete="email" />
      </div>
      {state.status !== "idle" ? (
        <div>
          <p
            role="status"
            className={
              state.status === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium"
            }
          >
            {state.message}
          </p>
          {state.status === "done" ? <EmailDeliveryNote /> : null}
        </div>
      ) : null}
      <Button type="submit" disabled={pending} variant="outline" className="w-fit">
        {pending ? "Sending…" : "Change email"}
      </Button>
    </form>
  );
}

export function RevokeOthersForm() {
  const [state, action, pending] = useActionState(
    async (_prev: AccountState) => revokeOtherSessionsAction(),
    initial,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" disabled={pending} variant="outline" className="w-fit">
        {pending ? "Signing out…" : "Sign out other devices"}
      </Button>
      {state.status !== "idle" ? (
        <p role="status" className="text-sm font-medium">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
