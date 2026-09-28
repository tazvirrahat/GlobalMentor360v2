import Link from "next/link";
import { AUTH_LINK, AuthLayout } from "@/components/auth/auth-layout";
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
    <AuthLayout
      title="Sign in"
      lede="Welcome back. Sign in to continue learning."
      footer={
        <>
          New here?{" "}
          <Link href="/sign-up" className={AUTH_LINK}>
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm next={safeReturnPath(next)} />
    </AuthLayout>
  );
}
