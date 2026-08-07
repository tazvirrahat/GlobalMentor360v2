"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    await requestPasswordReset({ email, redirectTo: "/reset-password" });

    setPending(false);
    // Always claim success — revealing whether the email exists would let
    // anyone probe which addresses are registered.
    setSent(true);
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-muted-foreground">
          Enter your email and we&rsquo;ll send you a reset link.
        </p>
      </div>

      {sent ? (
        <Alert role="status">
          <MailCheck className="size-4 text-brand" />
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            If an account exists for <strong>{email}</strong>, a reset link is on its way. It
            expires in one hour.
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

              <Button type="submit" disabled={pending} className="shadow-brand">
                {pending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
