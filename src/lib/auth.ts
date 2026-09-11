import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { prismaUnsafe } from "./db";
import { sendEmail, verificationEmail } from "./email";
import { ensurePersonalWorkspace } from "./tenancy";

/**
 * Authentication.
 *
 * Email + password with REQUIRED verification — a session cannot exist for an
 * unverified address. Google is offered alongside it, and only when its
 * credentials are configured, so a missing client id degrades to email-only
 * instead of rendering a button that fails.
 *
 * Every new user gets a personal workspace the moment the user row exists.
 */

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const googleEnabled = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
  database: prismaAdapter(prismaUnsafe, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    // Awaited, not fired and forgotten: on a serverless function, work left
    // running after the response is sent can be frozen before the email goes.
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...verificationEmail(user.name, url) });
    },
  },

  socialProviders: googleEnabled
    ? { google: { clientId: googleClientId!, clientSecret: googleClientSecret! } }
    : {},

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensurePersonalWorkspace(user.id, user.name ?? "");
        },
      },
    },
  },

  // Lets server actions set the session cookie. Must be the last plugin.
  plugins: [nextCookies()],
});
