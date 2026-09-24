import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getSite } from "@/lib/site";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  emailAndPassword: {
    enabled: true,
    // No session exists until the address is verified — unverified accounts
    // cannot sign in at all. lib/email falls back to console logging in dev,
    // so this stays on everywhere.
    requireEmailVerification: true,
    minPasswordLength: 12,

    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: `Reset your ${getSite().name} password`,
        text: `Hi ${user.name},\n\nSomeone asked to reset the password for this account. If that was you, use the button below. The link expires in one hour.\n\nIf you didn't ask, ignore this email — nothing changes.`,
        actionUrl: url,
        actionLabel: "Reset password",
      });
    },
    // Anyone who could reset the password owned the inbox; stale sessions on
    // other devices should not survive a takeover recovery.
    revokeSessionsOnPasswordReset: true,
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: `Verify your email for ${getSite().name}`,
        text: `Hi ${user.name},\n\nConfirm this address to activate your account. The link expires in one hour.`,
        actionUrl: url,
        actionLabel: "Verify email",
      });
    },
    sendOnSignUp: true,
    // A sign-in attempt on an unverified account re-sends the link, so "I lost
    // the first email" self-serves instead of dead-ending.
    sendOnSignIn: true,
    // Clicking the link both verifies and signs in — no second sign-in step.
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  user: {
    additionalFields: {
      headline: { type: "string", required: false },
      locale: { type: "string", required: false, defaultValue: "en" },
      timezone: { type: "string", required: false, defaultValue: "UTC" },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendEmail({
          to: user.email,
          subject: `Confirm your ${getSite().name} email change`,
          text: `Hi ${user.name},\n\nWe received a request to change this account's email to ${newEmail}. Confirm the change with the button below. The link expires in one hour.\n\nIf you didn't ask, ignore this email — the address stays as it is.`,
          actionUrl: url,
          actionLabel: "Confirm email change",
        });
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Every account is a learner. Instructor and admin are granted separately —
        // without this, a new user has no roles and every requireRole check fails.
        after: async (user) => {
          await db.userRole.create({
            data: { userId: user.id, role: "LEARNER" },
          });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
