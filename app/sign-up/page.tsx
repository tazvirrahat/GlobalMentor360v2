import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 sm:px-6">
      <SignUpForm />
    </main>
  );
}
