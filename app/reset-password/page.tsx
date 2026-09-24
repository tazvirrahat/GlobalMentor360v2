import Link from "next/link";
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
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Choose a new password</h1>
      </div>

      {!token || error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>This reset link is invalid or expired</AlertTitle>
          <AlertDescription>
            <p>Reset links only work once and expire after an hour.</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/forgot-password" className="cursor-pointer">
                Request a new link
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </main>
  );
}
