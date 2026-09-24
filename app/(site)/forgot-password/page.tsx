import Link from "next/link";
import { AUTH_LINK, AuthLayout } from "@/components/auth/auth-layout";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      lede="Enter the email you signed up with and we will send you a link to choose a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/sign-in" className={AUTH_LINK}>
            Sign in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
