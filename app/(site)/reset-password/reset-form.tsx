"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/password-input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
    const { error: resetError } = await resetPassword({ newPassword: password, token });
    setPending(false);

    if (resetError) {
      setError(
        resetError.message ??
          "This reset link is invalid or has expired. Request a new one and try again.",
      );
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/sign-in"), 2500);
  }

  if (done) {
    return (
      <Alert role="status" variant="verified">
        <CircleCheck className="size-4" />
        <AlertTitle>Password updated</AlertTitle>
        <AlertDescription>
          You can sign in with your new password now — redirecting you to{" "}
          <Link href="/sign-in" className="font-semibold text-ink underline underline-offset-4">
            sign in
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }

  return (
        <form method="post" action="/reset-password" onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">New password</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="new-password-hint"
            />
            <p id="new-password-hint" className="text-sm text-graphite">
              At least 12 characters.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <PasswordInput
              id="confirm"
              name="confirm"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "reset-error" : undefined}
            />
          </div>

          {error ? (
            <p id="reset-error" role="alert" className="text-sm font-medium text-seal">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
  );
}
