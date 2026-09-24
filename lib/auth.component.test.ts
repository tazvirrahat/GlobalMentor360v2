import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Better Auth is configured as an object literal inside betterAuth({...}).
 * The flags below are load-bearing for sign-up (no session until verified) and
 * recovery (stale sessions die on password reset). Importing `auth` would
 * initialise Prisma + Better Auth in the unit suite; reading the source locks
 * the flags without a database.
 */
const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "auth.ts"),
  "utf8",
);

function flag(key: string): boolean {
  const match = source.match(new RegExp(`${key}:\\s*(true|false)`));
  if (!match) throw new Error(`auth.ts is missing ${key}`);
  return match[1] === "true";
}

describe("Better Auth config (documented assertions)", () => {
  it("requires email verification before a session exists", () => {
    expect(flag("requireEmailVerification")).toBe(true);
  });

  it("sends verification mail on sign-up and on sign-in of an unverified account", () => {
    expect(flag("sendOnSignUp")).toBe(true);
    expect(flag("sendOnSignIn")).toBe(true);
  });

  it("signs the user in when they click the verification link", () => {
    expect(flag("autoSignInAfterVerification")).toBe(true);
  });

  it("revokes other sessions when the password is reset", () => {
    expect(flag("revokeSessionsOnPasswordReset")).toBe(true);
  });

  it("enables change-email with a confirmation mail to the current address", () => {
    expect(source).toMatch(/changeEmail:\s*\{[\s\S]*?enabled:\s*true/);
    expect(source).toContain("sendChangeEmailConfirmation");
    expect(source).toContain("Confirm your ${getSite().name} email change");
    // Confirmation goes to the *current* inbox (`user.email`), not `newEmail`,
    // so a stranger who typed a new address cannot steal the account.
    expect(source).toMatch(
      /sendChangeEmailConfirmation:[\s\S]*?to:\s*user\.email[\s\S]*?newEmail/,
    );
  });

  it("grants LEARNER on user create so requireRole is not a dead end", () => {
    expect(source).toContain('role: "LEARNER"');
    expect(source).toContain("databaseHooks");
  });
});

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readApp(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Auth UI (password must never land in the query string)", () => {
  it("posts sign-in, sign-up, forgot-password, and reset forms", () => {
    expect(readApp("app/sign-in/sign-in-form.tsx")).toMatch(/<form method="post"/);
    expect(readApp("app/sign-up/sign-up-form.tsx")).toMatch(/<form method="post"/);
    expect(readApp("app/forgot-password/forgot-password-form.tsx")).toMatch(/<form method="post"/);
    expect(readApp("app/reset-password/reset-form.tsx")).toMatch(/<form method="post"/);
  });

  it("does not treat every sign-in failure as a wrong password", () => {
    const form = readApp("app/sign-in/sign-in-form.tsx");
    expect(form).toContain("signInError.status === 401");
    expect(form).toContain("Could not sign in. Try again in a moment.");
  });

  it("warns that SES sandbox / local console may be the real inbox", () => {
    const note = readApp("components/auth/email-delivery-note.tsx");
    expect(note).toMatch(/SES sandbox/);
    expect(note).toMatch(/server terminal/);
    expect(note).toMatch(/fully enabled/);
    expect(readApp("app/sign-up/sign-up-form.tsx")).toContain("EmailDeliveryNote");
    expect(readApp("app/forgot-password/forgot-password-form.tsx")).toContain("EmailDeliveryNote");
    expect(readApp("app/sign-in/sign-in-form.tsx")).toContain("EmailDeliveryNote");
  });

  it("lets the learner sign out from /account, not only My learning", () => {
    expect(readApp("app/account/page.tsx")).toContain("SignOutButton");
  });
});
