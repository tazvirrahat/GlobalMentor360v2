"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { EmailDeliveryNote } from "@/components/auth/email-delivery-note";
import { FieldError } from "@/components/site/field-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
      setError(signUpError.message ?? "Could not create the account.");
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
      <>
        <Alert role="status">
          <MailCheck className="size-4 text-primary" />
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            <p>
              We sent a verification link to <strong>{submittedEmail}</strong>. Click it to
              activate your account — you can&rsquo;t sign in until then. The link expires in one
              hour.
            </p>
            <EmailDeliveryNote />
            <div className="mt-3 flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={onResend}>
                Resend email
              </Button>
              {resent ? (
                <span className="text-xs text-muted-foreground">Sent — check your inbox.</span>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>

        <p className="text-center text-sm text-muted-foreground">
          Already verified?{" "}
          <Link href="/sign-in" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-muted-foreground">Start learning in minutes.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form method="post" action="/sign-up" onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
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
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">At least 12 characters.</p>
            </div>

            {error ? <FieldError message={error} /> : null}

            <Button type="submit" disabled={pending}>
              {pending ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
