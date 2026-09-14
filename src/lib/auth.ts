import { checkout, polar, portal } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
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
 *
 * Billing (Polar) is wired the same way: without its keys the pricing page
 * says checkout isn't open yet, rather than offering a button that errors.
 */

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const googleEnabled = Boolean(googleClientId && googleClientSecret);

const polarToken = process.env.POLAR_ACCESS_TOKEN;
const polarProductId = process.env.POLAR_PRO_PRODUCT_ID;
export const billingEnabled = Boolean(polarToken && polarProductId);

// Subscription webhooks are handled by src/app/api/polar/webhooks/route.ts.

const billingPlugins = billingEnabled
  ? [
      polar({
        // Sandbox: judges pay with 4242 4242 4242 4242 and nothing is charged.
        client: new Polar({
          accessToken: polarToken!,
          server: process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
        }),
        // Off: a Polar outage must never block sign-up. Checkout creates the
        // customer on first use, keyed by the same external id.
        createCustomerOnSignUp: false,
        use: [
          checkout({
            products: [{ productId: polarProductId!, slug: "pro" }],
            successUrl: "/billing?checkout_id={CHECKOUT_ID}",
            authenticatedUsersOnly: true,
          }),
          portal(),
        ],
      }),
    ]
  : [];

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

  // nextCookies lets server actions set the session cookie. Must be last.
  plugins: [...billingPlugins, nextCookies()],
});
