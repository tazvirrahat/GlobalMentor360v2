"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { EmailDeliveryNote } from "@/components/auth/email-delivery-note";
import { FieldError } from "@/components/site/field-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { error: resetError } = await requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    setPending(false);
    // 5xx / network failures are not "check your inbox". Unknown emails still
    // return 200 from Better Auth, so a success screen does not leak accounts.
    if (resetError && (resetError.status == null || resetError.status >= 500)) {
      setError("Could not send the reset email. Try again in a moment.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Alert role="status">
        <MailCheck className="size-4 text-brand" />
        <AlertTitle>Check your email</AlertTitle>
        <AlertDescription>
          If an account exists for <strong>{email}</strong>, a reset link is on its way. It
          expires in one hour.
          <EmailDeliveryNote />
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <form method="post" action="/forgot-password" onSubmit={onSubmit} className="flex flex-col gap-4">
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

          {error ? <FieldError message={error} /> : null}

          <Button type="submit" disabled={pending} className="shadow-brand">
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
