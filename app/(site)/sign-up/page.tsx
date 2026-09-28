import Link from "next/link";
import { AUTH_LINK, AuthLayout } from "@/components/auth/auth-layout";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthLayout
      title="Create your account"
      lede="Learn at your own pace and get a certificate when you finish."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className={AUTH_LINK}>
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthLayout>
  );
}
