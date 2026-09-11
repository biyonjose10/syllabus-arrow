import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "./auth";
import { ensurePersonalWorkspace } from "./tenancy";

/**
 * The session layer — the real authentication boundary for pages and actions.
 * `proxy.ts` only redirects on a missing cookie; this validates the session
 * against the database.
 *
 * Cached per request, so a layout and its page validating the same session
 * cost one lookup, not two.
 */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireWorkspace(next = "/dashboard") {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const ctx = await ensurePersonalWorkspace(session.user.id, session.user.name);
  return { ctx, user: session.user };
}
