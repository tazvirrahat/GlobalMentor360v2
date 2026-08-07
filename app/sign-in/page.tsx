import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { safeReturnPath } from "@/lib/urls";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

/**
 * Server component so `?next=` is sanitised before it ever reaches the client.
 * Doing it here means the client cannot be tricked into navigating off-origin.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-muted-foreground">Sign in to continue learning.</p>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <SignInForm next={safeReturnPath(next)} />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/sign-up" className="font-semibold text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
