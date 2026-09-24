"use client";

import { useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { EmailDeliveryNote } from "@/components/auth/email-delivery-note";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { Label } from "@/components/ui/label";
import { sendVerificationEmail, signUp } from "@/lib/auth-client";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: signUpError } = await signUp.email({
      name,
      email,
      password,
      // Where the verification link lands after it signs the user in.
      callbackURL: "/dashboard",
    });

    setPending(false);

    if (signUpError) {
      setError(signUpError.message ?? "Could not create the account. Try again in a moment.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }

    // No session exists yet — access starts when the emailed link is clicked.
    setSubmittedEmail(email);
  }

  async function onResend() {
    if (!submittedEmail) return;
    setResent(false);
    await sendVerificationEmail({ email: submittedEmail, callbackURL: "/dashboard" });
    setResent(true);
  }

  if (submittedEmail) {
    return (
      <Alert role="status" variant="verified">
        <MailCheck className="size-4" />
        <AlertTitle>Check your email</AlertTitle>
        <AlertDescription>
          <p>
            We sent a verification link to <strong>{submittedEmail}</strong>. Open it to activate your account; you
            can sign in after that. The link expires in one hour.
          </p>
          <EmailDeliveryNote />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={onResend}>
              Resend email
            </Button>
            <span role="status" className="text-sm text-graphite">
              {resent ? "Sent. Check your inbox." : ""}
            </span>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form method="post" action="/sign-up" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-describedby="name-hint"
        />
        <p id="name-hint" className="text-sm text-graphite">
          As you want it on your certificates.
        </p>
      </div>

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
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-sm text-graphite">
          At least 12 characters.
        </p>
      </div>

      {error ? (
        <p ref={errorRef} tabIndex={-1} id="sign-up-error" role="alert" className="text-sm font-medium text-seal outline-none">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
