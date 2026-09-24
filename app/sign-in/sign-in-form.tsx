"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailWarning } from "lucide-react";
import { EmailDeliveryNote } from "@/components/auth/email-delivery-note";
import { FieldError } from "@/components/site/field-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

/** `next` is validated server-side by safeReturnPath before it reaches this component. */
export function SignInForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setUnverified(false);
    setPending(true);

    const { error: signInError } = await signIn.email({ email, password });

    setPending(false);

    if (signInError) {
      // 403 / FORBIDDEN: credentials were right but the email isn't verified yet.
      // The server re-sends the verification link on this attempt (sendOnSignIn).
      if (signInError.status === 403) {
        setUnverified(true);
        return;
      }
      // 401 is the only "bad credentials" code. A 5xx or a network failure is
      // not a wrong password — saying it is strands people who typed correctly.
      if (signInError.status === 401 || signInError.status === 400) {
        // Deliberately vague: distinguishing "no such account" from "wrong
        // password" tells an attacker which emails are registered.
        setError("Email or password is incorrect.");
        return;
      }
      setError("Could not sign in. Try again in a moment.");
      return;
    }

    router.push((next ?? "/dashboard") as Route);
    router.refresh();
  }

  return (
    <form method="post" action="/sign-in" onSubmit={onSubmit} className="flex flex-col gap-4">
      {unverified ? (
        <Alert role="status">
          <MailWarning className="size-4 text-primary" />
          <AlertTitle>Verify your email first</AlertTitle>
          <AlertDescription>
            Your account exists but the email isn&rsquo;t verified yet, so sign-in is blocked.
            We&rsquo;ve just sent a fresh verification link to <strong>{email}</strong> — click it
            and you&rsquo;ll be signed in automatically.
            <EmailDeliveryNote />
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error ? <FieldError message={error} /> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
