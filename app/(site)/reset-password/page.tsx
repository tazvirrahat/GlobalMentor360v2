import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Reset password" };

/**
 * Landing page for the emailed reset link. Better Auth appends `?token=` to the
 * redirectTo URL; without a token (or with `?error=`) the link is dead and the
 * only useful action is requesting a fresh one.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <AuthLayout title="Choose a new password">
      {!token || error ? (
        <Alert variant="destructive">
          <AlertTitle>This reset link is invalid or has expired</AlertTitle>
          <AlertDescription>
            <p>Reset links work once and expire after an hour. Ask for a new one.</p>
            <Button asChild variant="secondary" size="sm" className="mt-2">
              <Link href="/forgot-password">Send a new link</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </AuthLayout>
  );
}
