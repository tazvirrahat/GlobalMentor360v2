import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  emailAndPassword: {
    enabled: true,
    // Catalog A lists email verification as P0. It stays off until a mail provider
    // is wired, because turning it on first would lock every new account out.
    requireEmailVerification: false,
    minPasswordLength: 12,
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
