import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Auth is served by this same app, so default to the page's own origin.
  // A hardcoded localhost fallback would silently break sign-in on any
  // deployment (or dev port) where NEXT_PUBLIC_APP_URL wasn't rebaked.
  baseURL: process.env.NEXT_PUBLIC_APP_URL || undefined,
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  sendVerificationEmail,
  requestPasswordReset,
  resetPassword,
} = authClient;
