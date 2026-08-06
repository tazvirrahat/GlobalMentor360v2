import { safeReturnPath } from "@/lib/urls";
import { SignInForm } from "./sign-in-form";

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
    <main>
      <h1>Sign in</h1>
      <SignInForm next={safeReturnPath(next)} />
    </main>
  );
}
